# 025 — Verifikasi Filter AND Antar-Kolom (bukti runtime)

## Tujuan
Membuktikan lewat bukti runtime (bukan hanya audit kode) bahwa `GET /sheets/:id/rows`
menggabungkan filter dari kolom berbeda dengan **AND** (irisan), sementara nilai
berulang dalam satu kolom tetap **OR** (sudah dibuktikan di task 023). Ini tugas
VERIFIKASI — bila perilaku menyimpang dari klaim desain, dicatat sebagai TEMUAN,
bukan ditambal diam-diam.

## Rencana Singkat
1. Pakai kembali sheet uji `023 FE Contract Test` (`7a0ec8fb-390f-44d3-a155-26ce89f4ca56`,
   task 023) — tambah satu kolom TEXT baru `Status` (nilai berulang) lewat
   `POST /sheets/:id/columns`, lalu isi tiap baris yang sudah ada lewat
   `PATCH /sheets/:id/rows/:rowId` (partial patch, kolom lain tak tersentuh).
2. Jalankan `GET /rows` dengan filter DUA kolom sekaligus (`Kategori` AND `Status`) dan
   bandingkan `total`/isi baris dengan hitungan manual (irisan, bukan gabungan).
3. Jalankan kombinasi OR-dalam-kolom + AND-antar-kolom.
4. Simpan response mentah ke `docs/responses/025-filter-and-capture.json`.

## Di luar lingkup
Tidak mengubah logika filter (`normalizeFacets`/`getRows`) — murni verifikasi.

## File Diubah
- `docs/tasks/025-verify-filter-and.md` — task log ini.
- `docs/responses/025-filter-and-capture.json` — kumpulan response mentah (bukti runtime).

Tidak ada perubahan kode sumber — murni verifikasi.

## Fixture
Menambah kolom TEXT `Status` (id `b889aebd-378d-4265-b3e0-8303de8c025f`) ke sheet
`023 FE Contract Test` (`7a0ec8fb-390f-44d3-a155-26ce89f4ca56`) via
`POST /sheets/:id/columns`, lalu isi tiap baris yang sudah ada via `PATCH .../rows/:rowId`
(partial patch — kolom `A`, `B`, `Total`, `Kategori` tidak tersentuh).

| Baris | Kategori | Status |
|---|---|---|
| 1 (A=10,B=5) | Alpha | Aktif |
| 2 (A=20,B=3) | Beta | Aktif |
| 3 (A=7,B=8) | Alpha | Nonaktif |
| 4 (A=1,B=1) | Gamma | Aktif |

Kombinasi ini sengaja dipilih supaya AND ≠ union dan ≠ irisan-kosong-selalu — baris 3
adalah "jebakan" (Alpha tapi Nonaktif) yang akan salah ikut ter-include kalau filter
sebenarnya OR/union, bukan AND.

## Hasil Verifikasi (bukti runtime, lihat `docs/responses/025-filter-and-capture.json`)

| # | Query | Prediksi (irisan manual) | Aktual | Status |
|---|---|---|---|---|
| T1 | `filter[Kategori][]=Alpha&filter[Status][]=Aktif` | Irisan Kategori=Alpha ({1,3}) ∩ Status=Aktif ({1,2,4}) = **{1}** → `total=1` | `total:1`, `rows:[baris1]` | ✅ AND terbukti (baris 3 — Alpha tapi Nonaktif — benar dikecualikan) |
| T2 | `filter[Kategori][]=Alpha&filter[Kategori][]=Beta&filter[Status][]=Aktif` | (Kategori∈{Alpha,Beta}={1,2,3}) ∩ (Status=Aktif={1,2,4}) = **{1,2}** → `total=2` | `total:2`, `rows:[baris1,baris2]` | ✅ OR-dalam-kolom + AND-antar-kolom bekerja bersamaan |
| T3 | `filter[Kategori][]=Gamma&filter[Status][]=Nonaktif` | Kategori=Gamma={4} ∩ Status=Nonaktif={3} = **∅** → `total=0` | `total:0`, `rows:[]` | ✅ Irisan kosong ditangani benar (tidak fallback ke "tampilkan semua") |

Tidak ada penyimpangan — perilaku sesuai klaim desain (`AND` antar `cells.some(...)` per
kolom, `OR` di dalam `values.in` per kolom). **Tidak ada TEMUAN.**

Bentuk `rows[i]` tetap `{rowId, orderIndex, cells}` seperti capture 023 — hanya bertambah
satu key baru di `cells` (`statusColId`) karena kolom baru, bukan perubahan bentuk.
`aggregates` (SUM pada A, dari task 023) tetap konsisten menghitung dari seluruh baris
sheet, tidak ikut terfilter — sama seperti temuan T-2 di task 023.

## Belajar dari Sini
Verifikasi AND-vs-OR yang meyakinkan butuh **kasus jebakan**: baris yang memenuhi satu
facet tapi tidak facet lain (baris 3: Alpha+Nonaktif). Tanpa baris seperti ini, hasil AND
dan union bisa kebetulan sama besar untuk data kecil, sehingga tesnya tidak benar-benar
membuktikan operator yang dipakai. Prediksi dihitung manual dulu (irisan set eksplisit)
sebelum request dikirim, supaya perbandingan "aktual vs harapan" objektif — bukan menerima
begitu saja `total` yang keluar dari server.
