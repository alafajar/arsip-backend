# 003d — Baca Isi Tabel: `GET /sheets/:id/rows`

## Tujuan
Menyediakan endpoint read-only yang mengembalikan baris-baris data sheet dalam bentuk
**ter-pivot** (tiap baris berisi nilai cell-nya di-key per `columnId`), dengan pagination.
Termasuk memperluas seed dengan 3 baris contoh DTPS.

## Rencana singkat
1. Perluas `prisma/seed.ts` — 3 baris + cell DTPS, idempoten via UUID sentinel.
2. Tambah `getRows(sheetId, limit, offset)` ke `SheetsService` — satu query baris+cell,
   pivot di memori, kembalikan `{ rows, total, limit, offset }`.
3. Tambah `GET :id/rows` ke `SheetsController` dengan query param `limit` & `offset`.

## File diubah

| File | Alasan |
|---|---|
| `prisma/seed.ts` | Tambah 3 Row + Cell DTPS contoh dengan sentinel UUID (prefix 0004 untuk row) |
| `src/sheets/sheets.service.ts` | Tambah `getRows` — query + pivot + pagination |
| `src/sheets/sheets.controller.ts` | Tambah route `GET :id/rows` dengan `DefaultValuePipe`/`ParseIntPipe` |

## Keputusan kunci

- Clamping `limit` dilakukan di service: `Math.min(Math.max(1, limit), 200)`. Nilai di
  luar batas tidak error, hanya diclamp. Ini lebih ramah daripada throw 400 untuk batas.
- `count` dan `findMany` dijalankan paralel (`Promise.all`) — satu round-trip ekstra untuk
  mendapat total pagination, tapi tidak perlu menunggu secara serial.
- Kolom grup ("Kualifikasi Akademik") tidak punya Cell di DB → otomatis `null` di pivot.
  Tidak perlu logika khusus; cukup inisialisasi semua `columnId` sheet ke `null` dan isi
  yang ada.

## Belajar dari sini

### Kenapa 3d paling rawan N+1?
Bayangkan sheet dengan 24 baris. Pola **salah** (N+1):
```
for setiap baris:
  query: SELECT * FROM cells WHERE rowId = ?   ← 1 query per baris = 24 query
```
Pola **benar** yang dipakai di sini:
1. `row.findMany` dengan `include: { cells: ... }` → Prisma mengambil semua baris
   **sekaligus** dalam 1-2 query SQL (join atau batch IN).
2. Pivot di memori: loop di kode (bukan loop query ke DB).

Hasilnya: 4 query total (cek sheet, ambil columnId, count, findMany+cells) — **tidak
tumbuh** seiring jumlah baris.

### Kenapa nilai disimpan dan dikembalikan sebagai string?
`Cell.value` di schema adalah `String?`. Semua nilai — angka, tanggal, teks — disimpan
sebagai string. Ini penting untuk NIDN seperti `"0017026012"`: jika nilai di-coerce ke
`number`, JavaScript mengubahnya menjadi `17026012` dan nol di depan **hilang permanen**.
Dengan string, nilai dikembalikan apa adanya. Frontend yang memutuskan cara tampil
(number → format ribuan; boolean → ikon; URL → tautan klik) menggunakan metadata tipe
kolom dari **3c** (`/sheets/:id/columns`).

### Kenapa cell yang hilang dijadikan `null`, bukan dilewati?
Jika baris 1 punya 7 key di `cells` tapi baris 2 hanya 5 key, frontend harus menulis
kode defensif untuk setiap akses (`row.cells[colId] ?? null`). Dengan memastikan semua
baris punya **set key yang sama** (semua `columnId` sheet, isi `null` untuk yang tidak
ada Cell-nya di DB), frontend bisa langsung membaca `row.cells[colId]` tanpa guard —
konsisten, mudah diprediksi.

### Kenapa pagination wajib walau DTPS hanya 24 baris?
Engine ini bersifat generik: sheet lain bisa punya ratusan atau ribuan baris. Tanpa
batas, satu request bisa mengambil seluruh tabel ke memori server sekaligus. `limit`
default 50, maksimum 200 — nilai di luar batas diclamp (tidak error). Frontend
menggunakan `total`, `limit`, `offset` untuk membangun pager.

## Posisi di alur

```
menu (3a) → sheet metadata (3b) → kolom/struktur (3c) → isi/cell (3d) ← kita di sini
```

Blok baca (blok 3) selesai. Sprint 1 selanjutnya: import Excel (T5) dan tampilan
frontend tabel (T6).

## Cara verifikasi

```bash
SHEET="00000000-0000-0000-0002-000000000001"
TOKEN=<dari POST /auth/login>

# 1. Happy path: 3 baris, NIDN nol-depan utuh, cell kosong = null
curl "http://localhost:3000/sheets/$SHEET/rows" -H "Authorization: Bearer $TOKEN"

# 2. Sheet tidak ada → 404
curl "http://localhost:3000/sheets/00000000-0000-0000-9999-000000000001/rows" -H "Authorization: Bearer $TOKEN"

# 3. Bukan UUID → 400
curl "http://localhost:3000/sheets/bukan-uuid/rows" -H "Authorization: Bearer $TOKEN"

# 4. Tanpa token → 401
curl "http://localhost:3000/sheets/$SHEET/rows"

# 5. Pagination: limit=1, total tetap 3
curl "http://localhost:3000/sheets/$SHEET/rows?limit=1&offset=0" -H "Authorization: Bearer $TOKEN"

# 6. Idempoten: seed 2x → total tetap 3
npx prisma db seed
curl "http://localhost:3000/sheets/$SHEET/rows" -H "Authorization: Bearer $TOKEN" | jq '.total'
```
