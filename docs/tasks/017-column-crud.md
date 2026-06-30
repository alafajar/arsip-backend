# 017 — CRUD kolom (POST/PATCH/DELETE)

## Tujuan
Admin mengatur kolom pada tabel yang dapat ditulis: tambah, ubah nama/urutan, hapus (beserta cell-nya).

## Rencana singkat
1. DTO: `CreateColumnDto` (name, type, parentColumnId?, orderIndex?) + `UpdateColumnDto` (name?, orderIndex?).
2. `ColumnsService`: `createColumn`, `updateColumn`, `deleteColumn` — semua cek `assertWritableSheet`.
3. Route di `ColumnsController`: POST /sheets/:id/columns, PATCH /columns/:id, DELETE /columns/:id.
4. DELETE kolom grup yang masih punya anak → 400 (bukan cascade), alasan: mencegah penghapusan
   tidak sengaja pada struktur header bertingkat.

## Keputusan kunci
- **DELETE grup+anak → 400**: explicit, bukan cascade. Admin harus hapus anak dulu sebelum hapus grup.
- **orderIndex default**: max+1 antar sibling (parent+sheet sama).
- **Tipe tidak boleh diubah** di slice ini: ubah tipe punya konsekuensi data (invalidasi sel) → tunda.

## File diubah
- `src/columns/dto/create-column.dto.ts` — DTO baru
- `src/columns/dto/update-column.dto.ts` — DTO baru
- `src/columns/columns.service.ts` — service baru
- `src/columns/columns.controller.ts` — controller baru
- `src/columns/columns.module.ts` — wire controller + service

## Hasil tes

| # | Request | Expected | Actual | Status |
|---|---------|----------|--------|--------|
| T1 | POST kolom daun | 201 + fields | orderIndex=1, parentColumnId=null | ✅ |
| T2 | POST kolom grup | 201 | orderIndex=2 (max+1 sibling) | ✅ |
| T3 | POST kolom anak (parentColumnId) | 201, parentColumnId terisi | sama | ✅ |
| T4 | PATCH rename | 200, name baru | nama berubah | ✅ |
| T5 | PATCH orderIndex | 200, orderIndex baru | orderIndex berubah | ✅ |
| T6 | DELETE kolom + cell cascade | 200, cell hilang dari rows | rows tidak punya kolom yang dihapus | ✅ |
| N1 | DELETE kolom grup masih punya anak | 400 + pesan | `"Kualifikasi" masih punya 1 kolom anak` | ✅ |
| N2 | Tipe tak valid | 400 | 400 | ✅ |
| N3 | Sheet tidak ada | 404 | 404 `Sheet tidak ditemukan` | ✅ |
| N4 | Non-admin (kaprodi) | 403 | 403 | ✅ |
| N5 | Tanpa token | 401 | 401 | ✅ |
| N6 | Column ID bukan UUID | 400 | 400 | ✅ |
| N7 | Column tidak ada | 404 | 404 `Kolom tidak ditemukan` | ✅ |
| N8 | Sheet isReadOnly=true → 409 | dicek via `assertWritableSheet` (logic sama dengan rows endpoints, sudah ditest di BE-S2-004) | — | (logic verified) |

## Belajar dari sini

**DELETE kolom grup → 400, bukan cascade**
Pilihan eksplisit: admin harus hapus anak sebelum hapus induk.
Cascade tersedia di DB (`onDelete: Cascade` pada `Column.parentColumnId`) tapi sengaja tidak diaktifkan
dari endpoint untuk mencegah penghapusan tidak sengaja pada struktur header bertingkat.
Bayangkan tabel DTPS dengan kolom "Kualifikasi Akademik" punya 2 anak — cascade tanpa konfirmasi
akan menghapus semua data di 2 kolom anak sekaligus.

**Cell ikut terhapus via DB cascade**
`Cell.columnId` punya `onDelete: Cascade` di schema Prisma.
Artinya: satu `tx.column.delete()` sudah cukup — PostgreSQL otomatis menghapus semua `Cell`
yang mereferensikan kolom tersebut. Tidak perlu `tx.cell.deleteMany()` dulu.
Terbukti: setelah DELETE kolom, keys cells di respons rows hanya berisi sibling yang tersisa.

**orderIndex default: max+1 antar sibling**
`parentColumnId ?? null` digunakan sebagai filter agar kolom top-level dan anak-anak tiap grup
punya urutan independen — konsisten dengan perilaku `createRow`.

**PrismaModule global → inject tanpa import ulang**
`@Global()` pada `PrismaModule` berarti `PrismaService` tersedia di seluruh modul tanpa
harus di-import satu per satu. `ColumnsModule` cukup declare provider `ColumnsService`
yang inject `PrismaService` dan semuanya berjalan.
