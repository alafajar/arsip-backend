# 007 — Read-Only Write Guard

## Tujuan
Menutup celah: endpoint tulis baris (`POST/PATCH/DELETE /sheets/:id/rows`) dibuat sebelum
flag `Sheet.isReadOnly` ada, sehingga belum mengeceknya. Admin masih bisa menulis ke sheet
cermin grid (EWMP, DTPS-mirror, dsb) yang seharusnya hanya-baca.

## Rencana singkat
1. Tambah helper privat `assertWritableSheet(sheetId)` di `SheetsService`:
   - Ambil sheet (`select: { id, isReadOnly }`).
   - Tidak ada → `NotFoundException` (404).
   - `isReadOnly === true` → `ConflictException` (409).
2. Ganti cek "Sheet ada?" di ketiga method tulis (`createRow`, `updateRow`, `deleteRow`)
   dengan panggilan helper yang sama — satu titik, tidak duplikasi.
3. Tidak ada perubahan schema, tidak ada endpoint baru.

## File diubah
- `src/sheets/sheets.service.ts`
  - Import `ConflictException` dari `@nestjs/common`.
  - Tambah method privat `assertWritableSheet`.
  - Ganti cek inline di `createRow`, `updateRow`, `deleteRow` dengan panggilan helper.

## Keputusan kunci
- **409 bukan 403**: 403 sudah dipakai untuk "role tidak cukup" (kaprodi via Guard). 409 Conflict
  memberi sinyal yang berbeda ke frontend: "sheet ini read-only", bukan "peranmu tidak boleh".
- **Cek sebelum transaksi**: helper dipanggil sebelum query tulis apa pun — fail-fast, tidak ada
  setengah-tulis yang perlu di-rollback.
- **Satu helper, tiga pemanggil**: mengganti tiga blok `findUnique` serupa dengan satu method
  privat — perubahan di satu tempat cukup kalau logikanya berubah di masa depan.

## Hasil tes negatif (wajib)
Gunakan token ADMIN, sheet EWMP (`isReadOnly:true`) dan DTPS (`isReadOnly:false`):

| # | Request | Expected |
|---|---------|----------|
| 1 | `POST /sheets/{EWMP_ID}/rows` (body cell valid) | 409 + pesan hanya-baca |
| 2 | `PATCH /sheets/{EWMP_ID}/rows/{anyRowId}` | 409 |
| 3 | `DELETE /sheets/{EWMP_ID}/rows/{anyRowId}` | 409 |
| 4 | `POST /sheets/{DTPS_ID}/rows` (cell valid) | 201 (tidak rusak) |
| 5 | Token KAPRODI ke salah satu di atas | 403 (role diutamakan, Guard jalan duluan) |
| 6 | Sheet ID tidak ada | 404 |

## Belajar dari sini
**Kenapa helper privat, bukan inline?**
Tiga method melakukan cek yang sama: "sheet ada dan bisa ditulis?". Tanpa helper, logikanya
tersebar di tiga tempat — kalau besok kita mau tambah cek lain (misal: sheet sedang dikunci
sementara), kita harus ingat mengubah tiga tempat. Helper privat = satu pintu masuk.

**Urutan kegagalan: Guard dulu, service kemudian**
Guard (`@Roles`) dicek NestJS *sebelum* method controller dipanggil. Jadi token KAPRODI
sudah di-reject (403) bahkan sebelum service sempat cek `isReadOnly`. Ini desain yang
disengaja: authorization (siapa?) di Guard, business rule (boleh apa?) di service.

**409 Conflict vs 403 Forbidden**
- 403 = "kamu tidak boleh melakukan ini" (masalah di subjek/user).
- 409 = "permintaanmu bertabrakan dengan keadaan resource saat ini" (masalah di objek/resource).
Pilihan kode HTTP yang tepat membuat frontend bisa menampilkan pesan yang berbeda tanpa
harus mem-parse body error.
