# 003g — Hapus Baris: `DELETE /sheets/:id/rows/:rowId`

## Tujuan
Menutup CRUD baris dengan endpoint hapus permanen. Admin menghapus satu baris beserta
sel-selnya. `ChangeLog` mencatat snapshot sebelum data hilang.

## Rencana singkat
1. Tambah `deleteRow` ke `SheetsService` — validasi → snapshot → transaksi (audit + delete Row).
2. Tambah `DELETE :id/rows/:rowId` ke `SheetsController` — `@Roles(Role.ADMIN)`.

Tidak ada DTO baru — semua info dari path params.

## File diubah

| File | Alasan |
|---|---|
| `src/sheets/sheets.service.ts` | Tambah `deleteRow` |
| `src/sheets/sheets.controller.ts` | Tambah route `DELETE :id/rows/:rowId` + import `Delete` |

## Keputusan kunci

### Cascade ditemukan di schema
`Cell` punya `onDelete: Cascade` pada relasi ke `Row`:
```
row Row @relation(fields: [rowId], references: [id], onDelete: Cascade)
```
Artinya: menghapus Row otomatis menghapus semua Cell-nya di level database. Tidak perlu
`deleteMany(Cell)` manual di dalam transaksi — cukup `tx.row.delete(...)`. PostgreSQL
menangani cascade-nya.

### Audit dicatat **sebelum** hapus
`ChangeLog` ditulis di dalam transaksi, **sebelum** `tx.row.delete`. Urutan ini penting:
jika delete gagal (mis. constraint yang tak terduga), transaksi rollback dan `ChangeLog`
juga ikut rollback — tidak ada entri audit palsu. Sebaliknya, jika audit ditulis
**sesudah** delete dan delete berhasil tapi audit gagal, baris sudah hilang tapi tidak
ada catatan — data hilang tanpa jejak.

### Snapshot di `beforeData`
`ChangeLog.beforeData` (Json?) menyimpan `{ sheetId, orderIndex, cells: [...] }` sebelum
baris dihapus. Ini "jaring pengaman" Sprint 1 menggantikan soft delete: data tidak bisa
di-restore via UI, tapi DBA bisa melihat apa yang dihapus jika ada kesalahan. Sprint 2
akan mengimplementasikan soft delete (`deletedAt`) dengan restore via UI.

## Belajar dari sini

### Kenapa hard delete di Sprint 1?
`CLAUDE.md` meletakkan soft delete di **backlog Sprint 2**. Membangun setengah soft
delete sekarang (mis. menambah `deletedAt` tanpa UI restore) menciptakan kompleksitas
tanpa manfaat: semua query baca harus menyaring `deletedAt IS NULL`, tapi tidak ada
cara recovery yang nyata. Lebih bersih: hard delete + audit log sebagai pengaman
minimal, lalu Sprint 2 membangun soft delete secara menyeluruh.

### Cascade vs hapus-cell-manual
Dua situasi yang mungkin:
- **Ada cascade** (situasi kita): `onDelete: Cascade` di schema → Prisma + PostgreSQL
  menghapus Cell secara otomatis saat Row dihapus. Urutan dalam transaksi: audit → delete Row.
- **Tanpa cascade**: FK constraint mencegah delete Row jika masih ada Cell yang mereferens.
  Harus `deleteMany(Cell)` dulu, baru `delete(Row)`.

Selalu cek schema sebelum menulis urutan operasi.

### Kenapa cek "row milik sheet ini"?
Sama seperti 3f: `DELETE /sheets/SHEET-A/rows/ROW-dari-SHEET-B` harus ditolak 404,
bukan menghapus baris dari sheet yang salah. Cek `row.sheetId === sheetId` adalah
penjaga kepemilikan resource — path params harus konsisten.

### Kenapa `orderIndex` tidak di-rapikan?
Setelah baris ke-2 dihapus dari urutan [1, 2, 3], `orderIndex` menjadi [1, 3] — ada
gap. Ini tidak masalah: `ORDER BY orderIndex ASC` di 3d tetap menghasilkan urutan
yang benar (1 sebelum 3). Me-renumber ulang semua baris yang tersisa membutuhkan
update massal yang mahal dan tidak memberikan nilai di sisi query.

### Apakah kolom "No." harus di-renumber?
Kolom "No." adalah **nilai data** yang diisi user (atau import), bukan kolom kalkulasi
otomatis. Menghapus baris ke-2 tidak otomatis mengubah "No." baris ke-3 dari "3" menjadi
"2" — itu keputusan tampilan yang bergantung pada kebutuhan bisnis. Jika ingin nomor urut
otomatis, solusinya adalah menghasilkan nilai "No." saat render (frontend menghitung dari
posisi array), bukan menyimpannya sebagai nilai. Keputusan ini bukan tugas slice ini.

## Posisi di alur

```
create (3e) → edit (3f) → hapus (3g) ← kita di sini
                                           ↓
                                    CRUD baris lengkap
                                           ↓
                                    import Excel (T5)
```

## Cara verifikasi

```bash
SHEET="00000000-0000-0000-0002-000000000001"
ROW="<rowId yang akan dihapus>"
ADMIN_TOKEN=<dari POST /auth/login>

# 1. Hapus → 200, total berkurang 1
DELETE /sheets/$SHEET/rows/$ROW   → {"deleted":true,"rowId":"..."}
GET    /sheets/$SHEET/rows        → total berkurang 1

# 2. Hapus lagi (sama) → 404 (sudah tidak ada)

# 3. KAPRODI → 403; tanpa token → 401

# 4. rowId milik sheet lain → 404; rowId acak → 404; bukan UUID → 400

# 5. Tidak ada orphan: sel baris yang dihapus juga hilang (via cascade)
```
