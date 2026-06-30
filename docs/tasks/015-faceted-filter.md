# 015 — Filter faceted pada GET /sheets/:id/rows

## Tujuan
Perluas `GET /sheets/:id/rows` agar menerima filter multi-nilai per kolom:
OR di dalam satu kolom, AND antar-kolom, exact match (K2), dieksekusi di DB.

## Rencana singkat
1. Tambah helper `normalizeFacets(raw?)` — ubah raw query object ke `FacetFilter[]`.
2. Update `getRows(sheetId, limit, offset, rawFilter?)` di `SheetsService`:
   - Validasi setiap `columnId` filter milik sheet → 400.
   - Bangun `AND: [{ cells: { some: { columnId, value: { in: [...] } } } }]` → Prisma.
   - Pakai `where` yang sama untuk `count` (total akurat) dan `findMany`.
3. Update controller: tambah `@Query('filter') rawFilter?` dan teruskan ke service.

## Format filter
`?filter[<columnId>][]=v1&filter[<columnId>][]=v2` — bracket-array qs.
Express/NestJS memparse ini menjadi `{ filter: { '<uuid>': ['v1', 'v2'] } }`.

## File diubah
- `src/sheets/sheets.service.ts` — update `getRows` + tambah helper `normalizeFacets`
- `src/sheets/sheets.controller.ts` — tambah `@Query('filter')` param

## File diubah
- `src/main.ts` — set `query parser` ke `'extended'` agar qs aktif (Express 5 fix)
- `src/sheets/sheets.service.ts` — tambah `normalizeFacets` + update `getRows`
- `src/sheets/sheets.controller.ts` — tambah `@Query('filter')`, hapus debug code

## Keputusan kunci
- **Exact match (K2)**: `value: { in: [...] }` — tidak ada contains/trgm.
- **DB-level**: `cells: { some: ... }` diterjemahkan ke `EXISTS (SELECT ... FROM cells WHERE ...)` oleh Prisma.
- **Validasi filter columnId**: dibandingkan dengan set columnId sheet yang sudah di-fetch — tidak ada query tambahan.
- **Express 5 fix**: Express 5 mengubah default query parser dari `'extended'` (qs) ke `'simple'` (URLSearchParams). Bracket notation `filter[uuid][]=val` tidak di-parse tanpa fix ini.

## Hasil tes

| # | Request | Expected | Actual | Status |
|---|---------|----------|--------|--------|
| T1 | No filter | total=3 | total=3, count=3 | ✅ |
| T2 | filter jabatan=Lektor | total=1 | total=1, count=1 | ✅ |
| T3 | filter jabatan OR [Lektor, Lektor Kepala] | total=2 | total=2, count=2 | ✅ |
| T4 | filter jabatan=Lektor AND nidn=0011081985 | total=1 | total=1, count=1 | ✅ |
| N1 | columnId bukan UUID | 400 | 400 `columnId filter "notauuid" tidak ditemukan` | ✅ |
| N2 | columnId UUID tidak ada di sheet | 400 | 400 `columnId filter "aaa..." tidak ditemukan` | ✅ |
| N3 | Tanpa token | 401 | 401 | ✅ |
| N4 | Sheet tidak ada | 404 | 404 `Sheet tidak ditemukan` | ✅ |

## Bukti EXISTS di SQL (dari Prisma query log)

```sql
SELECT COUNT(*) ... FROM (
  SELECT "rows"."id" FROM "rows"
  WHERE "rows"."sheetId" = $1
    AND EXISTS (SELECT "t0"."rowId" FROM "cells" AS "t0"
                WHERE "t0"."columnId" = $2 AND "t0"."value" IN ($3)
                AND "rows"."id" = "t0"."rowId")
    AND EXISTS (SELECT "t1"."rowId" FROM "cells" AS "t1"
                WHERE "t1"."columnId" = $4 AND "t1"."value" IN ($5)
                AND "rows"."id" = "t1"."rowId")
) AS "sub"
```

## Belajar dari sini

**Express 5 query parser regression**
Express 4 menggunakan `qs` (bracket notation `filter[uuid][]=val` → nested object) secara default.
Express 5 mengubah ke `'simple'` (URLSearchParams native Node.js) — bracket notation menjadi
literal string key `"filter[uuid][]"` dan tidak di-parse menjadi objek nested.
Fix: `app.set('query parser', 'extended')` di `main.ts` mengembalikan perilaku qs.
Pelajaran: selalu cek release notes framework saat upgrade major version — perubahan default
"kecil" seperti ini bisa memecah fitur tanpa compile error.

**AND antar-kolom vs OR dalam satu kolom**
- OR dalam kolom: `cells: { some: { columnId, value: { in: ['v1','v2'] } } }` — satu EXISTS per kolom.
- AND antar-kolom: `AND: [{ cells: { some: {...col1} } }, { cells: { some: {...col2} } }]` — dua EXISTS terpisah.
Prisma menerjemahkan ini ke SQL yang bersih tanpa JOIN; tiap EXISTS adalah subquery terpisah,
sehingga PostgreSQL bisa mengoptimalkan dengan index pada `(columnId, value, rowId)`.

**Validasi filter tanpa query tambahan**
columnId dalam filter divalidasi dengan membandingkan terhadap set columnId yang sudah di-fetch
untuk pivot response (`allColumnIds`). Tidak ada round-trip ke DB tambahan.
