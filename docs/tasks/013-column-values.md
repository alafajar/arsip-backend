# 013 — Nilai unik per kolom (GET /sheets/:id/columns/:columnId/values)

## Tujuan
Sediakan endpoint untuk mengisi komponen filter multi-select di frontend:
mengembalikan nilai distinct non-kosong pada sebuah kolom daun, terurut naik, dengan batas 200.

## Rencana singkat
1. Tambah `getColumnValues(sheetId, columnId)` di `SheetsService`:
   - Cek sheet ada (404).
   - Cek kolom ada DAN milik sheet (404).
   - Cek kolom adalah daun (bukan grup, `childColumns > 0` → 400).
   - Query distinct via Prisma: `findMany({ distinct: ['value'], where: { columnId, value: { not: null } }, ... })`.
   - Filter nilai kosong (`''`) di sisi aplikasi setelah query.
   - Kembalikan `{ values: string[], total: number }`.
2. Tambah `GET :id/columns/:columnId/values` di `SheetsController` (ParseUUIDPipe keduanya).

## File diubah
- `src/sheets/sheets.service.ts` — tambah `getColumnValues`
- `src/sheets/sheets.controller.ts` — tambah route

## Keputusan kunci
- **Batas 200**: cukup untuk multi-select; nilai > 200 unik menandakan kolom tidak cocok di-filter.
- **Distinct di DB**: `findMany({ distinct: ['value'] })` → Prisma generate `SELECT DISTINCT value`.
  Tidak ambil semua lalu dedupe di memori.
- **Deteksi grup**: `_count.childColumns > 0` → 400. `parentColumnId = null` saja tidak cukup
  karena daun top-level juga null.
- **Nilai null vs string kosong**: filter keduanya (`value: { not: null }` di query + `filter` sisi app).

## Hasil tes

| # | Request | Expected | Actual | Status |
|---|---------|----------|--------|--------|
| T1 | GET .../Jabatan Akademik/values | `["Lektor","Lektor Kepala","Profesor"]` | sama | ✅ |
| T2 | GET .../NIDN/values | 3 NIDN unik, terurut | `["0011081985","0017026012","0023051978"]` | ✅ |
| N1 | Kolom grup (Kualifikasi Akademik) | 400 + pesan | 400 `Kolom grup tidak memiliki nilai` | ✅ |
| N2 | Sheet UUID tidak ada | 404 | 404 `Sheet tidak ditemukan` | ✅ |
| N3 | Kolom UUID tidak ada / beda sheet | 404 | 404 `Kolom tidak ditemukan di sheet ini` | ✅ |
| N4 | columnId bukan UUID | 400 | 400 `Validation failed (uuid is expected)` | ✅ |
| N5 | Tanpa token | 401 | 401 | ✅ |

## Bukti GROUP BY di DB (bukan dedupe di memori)

Query log Prisma setelah menggunakan `groupBy`:
```sql
SELECT "public"."cells"."value"
FROM "public"."cells"
WHERE ("public"."cells"."columnId" = $1 AND "public"."cells"."value" IS NOT NULL)
GROUP BY "public"."cells"."value"
ORDER BY "public"."cells"."value" ASC
LIMIT $2 OFFSET $3
```
Berbanding dengan `findMany({ distinct })` yang menghasilkan:
```sql
SELECT "id", "value" FROM cells WHERE ... ORDER BY value ASC OFFSET $2
-- lalu dedup di memori Prisma (id ikut di-SELECT → tiap baris unik)
```

## File diubah
- `src/sheets/sheets.service.ts` — tambah `getColumnValues` (menggunakan `groupBy`)
- `src/sheets/sheets.controller.ts` — tambah `GET :id/columns/:columnId/values`
- `docs/tasks/013-column-values.md` — file ini

## Belajar dari sini

**`groupBy` vs `findMany({ distinct })`**
Prisma's `findMany({ distinct: ['value'] })` terlihat bersih, tapi di balik layar ia menambahkan
primary key (`id`) ke SELECT dan melakukan dedup di memori aplikasi — bukan di DB.
`groupBy({ by: ['value'] })` menghasilkan `GROUP BY value` yang dieksekusi oleh PostgreSQL.
Untuk kolom dengan jutaan baris, perbedaan ini kritis: DB bisa pakai index untuk `GROUP BY`,
sedangkan dedup di memori harus memuat semua baris terlebih dahulu.

**Kenapa limit 200?**
Multi-select filter dengan > 200 opsi tidak berguna dari segi UX.
Bila ada > 200 nilai unik, kolom tersebut tidak cocok dijadikan filter pilih-ganda —
sebaiknya gunakan filter teks (contains) sebagai gantinya.

**Deteksi kolom grup**
`parentColumnId === null` saja tidak membedakan "daun top-level" dari "grup".
Hanya `_count.childColumns > 0` yang reliabel: sebuah kolom adalah grup
tepat ketika ia punya setidaknya satu kolom anak.
