# 003c — Baca Struktur Kolom: `GET /sheets/:id/columns`

## Tujuan
Menyediakan endpoint read-only yang mengembalikan kolom sebuah sheet sebagai **pohon
bersarang** — header grup berisi anak-anaknya di dalam field `children`. Termasuk
memperluas seed dengan kolom DTPS nyata (7 daun + 1 grup).

## Rencana singkat
1. Perluas `prisma/seed.ts` dengan 8 kolom DTPS (idempoten via UUID sentinel).
2. Tambah `getColumns(sheetId)` ke `SheetsService` — satu query, bangun pohon di memori.
3. Tambah `GET :id/columns` ke `SheetsController` dengan `ParseUUIDPipe`.

## File diubah

| File | Alasan |
|---|---|
| `prisma/seed.ts` | Tambah 8 kolom DTPS dengan sentinel UUID untuk idempotency |
| `src/sheets/sheets.service.ts` | Tambah `getColumns` — query + tree-building logic |
| `src/sheets/sheets.controller.ts` | Tambah route `GET :id/columns` |

`src/columns/columns.module.ts` **tidak diubah** — route kolom lebih natural sebagai
sub-resource sheet (`/sheets/:id/columns`), sehingga tetap di `SheetsModule`.

## Keputusan kunci

### Keputusan node grup `type` (bagian 1.2 prompt)
Schema mendefinisikan `Column.type` sebagai `ColumnType @default(TEXT)` — **non-nullable,
tidak ada `?`**. Tidak ada flag `isGroup` atau penanda grup lain di schema.

Karena `type` tidak bisa `null`, node grup "Kualifikasi Akademik" memakai nilai default
`TEXT`. Frontend membedakan grup vs daun bukan dari `type`, melainkan dari **ada/tidaknya
`children`** di response (grup = `children` non-kosong, daun = `children: []`). Keputusan
ini dicatat agar tidak mengejutkan saat frontend membaca response.

### Kenapa NIDN wajib TEXT
NIDN seperti `0017026012` dimulai dengan nol. Jika tipenya `INTEGER`, parser akan
mengubahnya menjadi `17026012` — nol di depan hilang permanen. Dengan `TEXT`, nilai
disimpan dan ditampilkan apa adanya. Ini adalah **Definition of Done Sprint 1**: NIDN
harus mempertahankan nol di depan.

### Anti-N+1: bangun pohon di memori
Pola sama dengan menu tree (003a):
1. Satu query `findMany` ambil seluruh kolom sheet, diurut `[{ orderIndex: asc }, { id: asc }]`.
2. Bangun `Map<id → node>` dari list datar.
3. Iterasi sekali lagi: kolom tanpa `parentColumnId` → dorong ke `roots`; punya parent
   → dorong ke `parent.children`.

Ini O(n) dan hanya satu round-trip ke DB — tidak ada loop yang memicu query per-node.

### Kenapa `CellMerge` tidak disentuh
`CellMerge` menyimpan posisi merge secara koordinat (startRow/endRow/startCol/endCol).
Slice ini hanya peduli struktur kolom (pohon header), bukan posisi fisik di grid.
Rendering rowspan/colspan visual adalah urusan frontend (T6), dan bahkan di sana DTPS
kemungkinan tidak punya merge di badan tabel — hanya di header grup yang sudah ditangani
lewat `parentColumnId`.

### Beda 404 vs 200 array kosong
- **Sheet tidak ada** → `NotFoundException` → **404**. Service cek dulu `sheet.findUnique`
  sebelum query kolom.
- **Sheet ada tapi belum punya kolom** → query `column.findMany` mengembalikan `[]` →
  **200** dengan array kosong. Dua kondisi berbeda, status code berbeda.

## Posisi di alur
```
menu (3a) → sheet metadata (3b) → kolom/struktur (3c) ← kita di sini
                                                     ↓
                                               cell/isi baris (3d)
```

## Cara verifikasi

```bash
SHEET="00000000-0000-0000-0002-000000000001"
TOKEN=<dari POST /auth/login>

# 1. Pohon benar: Magister & Doktor dalam children Kualifikasi Akademik; NIDN = TEXT
curl "http://localhost:3000/sheets/$SHEET/columns" -H "Authorization: Bearer $TOKEN"

# 2. Sheet tidak ada → 404
curl "http://localhost:3000/sheets/00000000-0000-0000-9999-000000000001/columns" \
  -H "Authorization: Bearer $TOKEN"

# 3. Bukan UUID → 400
curl "http://localhost:3000/sheets/bukan-uuid/columns" -H "Authorization: Bearer $TOKEN"

# 4. Tanpa token → 401
curl "http://localhost:3000/sheets/$SHEET/columns"

# 5. Idempoten: jalankan seed dua kali, jumlah kolom tetap 6 top-level (2 di dalamnya punya 2 anak)
npx prisma db seed && npx prisma db seed
curl "http://localhost:3000/sheets/$SHEET/columns" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"  # harus 6
```
