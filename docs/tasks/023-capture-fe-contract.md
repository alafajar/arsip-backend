# 023 — Capture Kontrak Response (Formula + Filter) untuk Fondasi Frontend

## Tujuan
Menutup celah pada response capture sebelumnya (belum memuat baris dengan nilai kolom
formula horizontal, agregat non-kosong, filter aktif pada `GET /rows`, dan status
`formulaOp`/`formulaOperandIds` pada `GET /columns`) dengan bukti runtime, agar frontend
Sprint 2 punya kontrak pasti untuk merender tabel. Ini tugas verifikasi/diagnosa —
BUKAN menambah fitur; celah kontrak dicatat sebagai temuan, bukan ditambal diam-diam.

## Rencana Singkat
1. Pastikan migrasi Prisma konsisten (tidak ada sisa migrasi setengah jalan).
2. Buat satu sheet uji baru (`isReadOnly=false`) dengan: 2 kolom INTEGER (A, B), 1 kolom
   formula horizontal (ADD, operand [A,B]), 1 kolom TEXT dengan nilai berulang, beberapa
   baris data, dan 1 agregat vertikal (SUM pada A).
3. Jalankan & simpan response mentah dari 5 endpoint: metadata sheet, columns, rows,
   rows dengan filter, dan column values — sebagai bukti kontrak.
4. Dokumentasikan bentuk field persis tiap endpoint dan jawab 5 pertanyaan wajib dari
   spec tugas.

## File Diubah
- `docs/tasks/023-capture-fe-contract.md` — task log ini (rencana + hasil)
- `docs/responses/023-fe-contract-capture.json` — kumpulan response mentah (bukti runtime)

## Fixture Uji
Sheet baru `023 FE Contract Test` (isReadOnly=false) dibuat via API di bawah menu
`023-fe-contract-test` (parent: Kriteria). ID lengkap ada di
`docs/responses/023-fe-contract-capture.json` → `fixtureIds`.

| Kolom | Tipe | Catatan |
|---|---|---|
| A | INTEGER | operand formula |
| B | INTEGER | operand formula |
| Total | INTEGER | `formulaOp=ADD`, `formulaOperandIds=[A,B]` |
| Kategori | TEXT | nilai berulang: Alpha, Beta, Alpha, Gamma |

4 baris: (A=10,B=5,Kat=Alpha), (A=20,B=3,Kat=Beta), (A=7,B=8,Kat=Alpha), (A=1,B=1,Kat=Gamma).
1 agregat: SUM pada kolom A.

Sebelum capture: `pnpm prisma migrate status` (via binary Prisma langsung, bukan lewat
alias shell) menunjukkan **5/5 migrasi ter-apply, skema up to date** — bukan sisa migrasi
setengah jalan. (Catatan: `pnpm prisma migrate status` yang dijalankan lewat hook shell rtk
sempat menampilkan output terpotong/menyesatkan `"0 applied, 0 pending"`; verifikasi ulang
langsung lewat `node node_modules/prisma/build/index.js migrate status` memberi hasil benar.)

## Bukti Runtime
Response mentah kelima endpoint (apa adanya, tanpa disunting) ada di:
**`docs/responses/023-fe-contract-capture.json`**

## Jawaban Wajib

**1. Kolom formula ditandai lewat field apa di `GET /sheets/:id/columns`?**
**TIDAK ADA — TEMUAN.** Kolom `Total` (formula ADD) kembali dengan bentuk yang identik
dengan kolom biasa: `{id, name, type, orderIndex, children}`. Tidak ada `formulaOp`,
`formulaOperandIds`, atau flag `isFormula` apa pun. Frontend **tidak bisa membedakan**
kolom formula dari kolom biasa hanya dari endpoint ini.
Dikonfirmasi baik dari kode (`SheetsService.getColumns`, `src/sheets/sheets.service.ts:103-106`,
`select` eksplisit hanya `{id, name, type, orderIndex, parentColumnId}`) maupun dari capture
runtime.
Sebagai perbandingan, `POST /sheets/:id/columns` dan `PATCH /columns/:id` **sudah**
mengembalikan `formulaOp` + `formulaOperandIds` (dipakai saat create/update saja, tak
pernah muncul lagi saat sheet dibuka via GET).

**2. Nilai formula per baris: muncul di mana, dan read-only?**
Muncul di `cells[columnId]` pada `GET /sheets/:id/rows`, sebagai **string**, sama seperti
sel biasa (tidak ada wadah terpisah). Dihitung ulang setiap kali `GET /rows` dipanggil
(tidak disimpan di DB) — nilai `Total` = `String(A) + String(B)` dievaluasi saat read.
**Read-only, dan ditegakkan di backend:** `POST /sheets/:id/rows` dengan cell yang
menunjuk ke `columnId` kolom formula ditolak `400`:
`"columnId \"...\" adalah kolom formula dan tidak bisa ditulis secara langsung."`
(diverifikasi langsung — lihat log eksekusi). Catatan tambahan: respons `POST`/`PATCH
rows` (create/update) mengembalikan `null` untuk sel kolom formula pada baris yang baru
dibuat — nilai terhitung **hanya** muncul lewat `GET /rows`, bukan di respons create/update
itu sendiri. Frontend yang melakukan optimistic update setelah create/update baris perlu
tahu ini (jangan andalkan respons create/update untuk nilai kolom formula; re-fetch atau
hitung sendiri di client).

**3. Bentuk agregat: `value` string atau number? Kosong: `[]` atau tanpa key?**
Bentuk persis: `{id: string, columnId: string, op: string, value: string}`.
`value` **selalu string** (dari `computeVerticalAggregate`, `src/aggregates/aggregates.service.ts:31-34`
— return type `: string`), termasuk SUM yang tetap `"38"` bukan `38`. Saat tidak ada baris
bernilai numerik, `value` adalah **string kosong `""`** (bukan `null`, bukan `"0"`).
Saat sheet **tidak punya definisi agregat sama sekali**, key `aggregates` tetap ADA di
respons `GET /rows` dengan **array kosong `[]`** (dikonfirmasi di capture sebelumnya
untuk sheet DTPS: `"aggregates": []`), bukan key yang dihilangkan.

**4. Filter: `GET /rows` menerima `filter[columnId][]=v`, dan `total` mencerminkan hasil filter?**
Ya, terbukti. Bentuk query persis: `?filter[<columnId>][]=v1&filter[<columnId>][]=v2`
(bracket-array qs, sesuai `main.ts` yang set `query parser: 'extended'`).
- 1 nilai (`filter[Kategori][]=Alpha`) → `total: 2`, hanya baris Alpha yang muncul.
- 2 nilai kolom sama (`filter[Kategori][]=Alpha&filter[Kategori][]=Beta`) → **OR** dalam
  kolom yang sama → `total: 3` (Alpha+Alpha+Beta, Gamma dikecualikan).
- Bentuk objek `rows[i]` **identik** dengan tanpa filter (sama-sama punya `cells` lengkap
  untuk semua kolom, termasuk kolom formula yang tetap terhitung).
- `aggregates` pada respons yang difilter **TIDAK ikut terfilter** — tetap menghitung dari
  SELURUH baris sheet (value tetap `"38"` walau `rows` yang tampil hanya 2-3 dari 4 baris).
  Ini bukan bug tapi perlu diketahui frontend: jangan asumsikan aggregate value = SUM dari
  `rows` yang sedang ditampilkan setelah filter aktif.

**5. `GET /auth/me` masih TANPA `fullName`?**
Ya, dikonfirmasi. `GET /auth/me` → `{id, username, role}` — tidak ada `fullName`.
Sebagai pembanding, `POST /auth/login` **mengembalikan** `fullName` di objek `user`.
Kode: `AuthController.me()` (`src/auth/auth.controller.ts:74-80`) mengembalikan `req.user`
langsung dari payload JWT (`{id, username, role}`), bukan query ulang ke DB — sehingga
`fullName` (kolom DB, bukan bagian payload token) tidak pernah muncul di endpoint ini.
Frontend **harus** fallback ke `username` untuk tampilan setelah refresh/reload sesi
(hanya login awal yang membawa `fullName`).

## Temuan

**TEMUAN T-1 (utama): `GET /sheets/:id/columns` tidak mengekspos `formulaOp`/`formulaOperandIds`.**
- **Dampak:** Frontend Sprint 2 tidak bisa menandai kolom formula secara visual (mis. ikon
  "read-only/terhitung") atau mencegah user mencoba mengedit sel tersebut di UI, tanpa
  informasi ini di endpoint yang memang dipakai untuk render header tabel.
- **Rekomendasi minimal (tidak diimplementasikan di slice ini):** Tambahkan `formulaOp` dan
  `formulaOperandIds` ke `select` dan ke interface `ColumnNode` pada
  `SheetsService.getColumns` (`src/sheets/sheets.service.ts:96-126`). Perubahan bersifat
  aditif (field baru, tidak mengubah field yang ada) — aman untuk kontrak yang sudah ada.
  Keputusan implementasi & prioritas dibuat terpisah sebelum FE mulai membangun render tabel.

**TEMUAN T-2 (minor, informasional): `aggregates` pada `GET /rows` tidak ikut terfilter.**
- Bukan cacat — agregat memang didesain menghitung dari seluruh baris sheet ("Nilai
  dihitung dari SELURUH baris (bukan hanya halaman aktif)", sesuai dokumentasi endpoint).
  Dicatat di sini murni karena frontend perlu tahu supaya tidak salah asumsi saat
  menampilkan footer agregat bersamaan dengan tabel yang sedang difilter/dipaginasi.

## File Diubah
- `docs/tasks/023-capture-fe-contract.md` — task log ini
- `docs/responses/023-fe-contract-capture.json` — kumpulan response mentah (bukti runtime)

## Belajar dari Sini
Kontrak API yang "terlihat lengkap" dari satu endpoint bisa pincang di endpoint lain:
`POST/PATCH /columns` sudah lama mengembalikan `formulaOp`, tapi `GET /columns` — endpoint
yang justru dipakai frontend untuk *membaca* struktur tabel — tidak pernah diperbarui untuk
menyertakannya. Ini pola umum saat fitur (formula, task 018-020) ditambahkan ke endpoint tulis
lebih dulu tanpa menelusuri semua endpoint baca yang bergantung pada bentuk data yang sama.
Pelajaran: saat menambah field baru ke sebuah entity, jangan cukup memeriksa
"endpoint yang saya sedang kerjakan" — telusuri semua `select` Prisma untuk entity
tersebut di seluruh service.

Kedua, agregat & nilai formula sama-sama **dihitung saat baca** (bukan disimpan) — pola yang
konsisten di codebase ini (lihat juga komentar "Nilai dihitung saat GET, bukan disimpan" di
`aggregates.controller.ts`). Ini artinya frontend tidak boleh cache nilai-nilai ini secara
optimis dari respons create/update; harus selalu percaya hasil `GET` terbaru.
