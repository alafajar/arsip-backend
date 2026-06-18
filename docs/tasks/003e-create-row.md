# 003e — Tulis Pertama: `POST /sheets/:id/rows`

## Tujuan
Mengimplementasikan endpoint pertama yang **menulis** ke database: menambah satu baris
baru beserta nilai cell-nya. Slice ini mengaktifkan seluruh guardrail C untuk pertama
kalinya (otorisasi peran, validasi per tipe, transaksi, audit trail).

## Rencana singkat
1. Buat `src/columns/column-value.validator.ts` — validator nilai per tipe kolom (mandiri).
2. Buat `src/sheets/dto/create-row.dto.ts` — DTO dengan validasi class-validator.
3. Tambah `createRow` ke `SheetsService` — validasi berlapis + transaksi atomik.
4. Tambah `POST :id/rows` ke `SheetsController` — `@Roles(Role.ADMIN)`.

## File diubah

| File | Alasan |
|---|---|
| `src/columns/column-value.validator.ts` | **Dibuat baru** — validator 7 tipe kolom, mandiri agar import (T5) bisa memakainya ulang |
| `src/sheets/dto/create-row.dto.ts` | **Dibuat baru** — DTO dengan `@Matches` UUID dan `@ValidateNested` per cell |
| `src/sheets/sheets.service.ts` | Tambah `createRow` — validasi berlapis + `$transaction` |
| `src/sheets/sheets.controller.ts` | Tambah `POST :id/rows` dengan `@Roles(Role.ADMIN)` |

## Keputusan kunci

### UUID sentinel dan `@Matches` vs `@IsUUID`
`@IsUUID('all')` dari class-validator/validator.js mewajibkan byte variant `[89AB]`
pada group ke-4 UUID (RFC 4122). Sentinel UUID yang dipakai seed (`0003`, `0002`, dll.)
memakai byte variant `0x00` (bukan RFC 4122), sehingga `@IsUUID()` menolaknya.
`ParseUUIDPipe` NestJS lebih permisif (hanya cek format 8-4-4-4-12 hex). Solusi: DTO
memakai `@Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)`
— validasi format saja, tanpa memeriksa version/variant. Keputusan ini konsisten dengan
perilaku `ParseUUIDPipe`.

### Format DATE: YYYY-MM-DD
Format ISO 8601 date dipilih karena:
- Universal dan tidak ambigu (tidak ada "03/04" yang bisa berarti Maret 4 atau April 3).
- Mudah diurutkan lexicografis (urut string = urut tanggal).
- Tidak menyertakan waktu/zona waktu, cukup untuk konteks data dosen.
Tanggal tidak valid (mis. "2024-02-30") ditolak via `isNaN(new Date(value).getTime())`.

## Belajar dari sini

### Otorisasi peran di server — kenapa sembunyi tombol tidak cukup
Jika hanya tombol "Tambah Baris" yang disembunyikan dari KAPRODI di UI, seorang KAPRODI
bisa tetap mengirim `POST /sheets/:id/rows` dengan token-nya menggunakan Postman atau
curl. Guard `@Roles(Role.ADMIN)` di server adalah satu-satunya penjaga yang benar-benar
mencegah aksi itu. UI menyembunyikan tombol untuk UX; server memblokir request untuk
keamanan. Keduanya wajib, tapi yang server adalah yang berhak.

### Validasi per tipe — kenapa "string mentah" tetap perlu divalidasi?
Semua `value` disimpan sebagai string di kolom `Cell.value`. Ini menjaga NIDN
`"0017026012"` utuh. Tapi "string" bukan berarti "boleh apa saja": nilai `"abc"` untuk
kolom INTEGER adalah data sampah — secara teknis tersimpan, tapi tidak bisa diolah.
Validator memastikan string itu **koheren** untuk tipe kolomnya: `"abc"` untuk INTEGER
ditolak 400, `"0017026012"` untuk TEXT diterima apa adanya tanpa diconvert ke angka.

### Transaksi atomik — bahaya baris setengah jadi
Dalam `prisma.$transaction`, tiga operasi tulis (create Row, createMany Cell, create
ChangeLog) berjalan dalam satu unit. Jika operasi ke-2 atau ke-3 gagal (mis. duplicate
key), **seluruh transaksi di-rollback** — tidak ada Row yang terbuat, tidak ada Cell
yang tersimpan. Tanpa transaksi, baris bisa terbuat tapi tanpa cell-nya (atau tanpa
audit trail), meninggalkan data yang tidak konsisten.

### Audit trail — `ChangeLog` pertama kali dipakai
`ChangeLog` menyimpan: `userId` (siapa), `createdAt` (kapan — otomatis dari schema),
`action: CREATE` (apa), `entityId: rowId` (rowId baris baru). Ini menjawab pertanyaan
"siapa yang menambah baris ini?" tanpa perlu memeriksa tabel Row. Di Sprint 2 (riwayat
versi), `beforeData`/`afterData` akan diisi lebih detail untuk edit/hapus.

### Validator dibuat mandiri
`column-value.validator.ts` ada di `src/columns/` (bukan di `src/sheets/`) karena:
- Import Excel (T5) perlu memvalidasi nilai per tipe kolom yang sama.
- Jika validator dikubur di dalam `SheetsService`, import (T5) harus memanggil
  service tersebut padahal ia tidak butuh logika sheets lainnya — coupling tidak perlu.
- Fungsi murni (`validateValueForType`) mudah di-unit test secara terpisah.

## Posisi di alur

```
baca lengkap (3a–3d)
      ↓
tulis: tambah baris (3e) ← kita di sini
      ↓
edit / hapus baris (3f)
      ↓
import Excel (T5)
```

## Cara verifikasi

```bash
SHEET="00000000-0000-0000-0002-000000000001"
ADMIN_TOKEN=<dari POST /auth/login dengan admin>
KAPRODI_TOKEN=<dari POST /auth/login dengan kaprodi>

# 1. Admin 201
curl -X POST http://localhost:3000/sheets/$SHEET/rows \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"cells":[{"columnId":"00000000-0000-0000-0003-000000000007","value":"0099031972"},...]}'

# 2. KAPRODI 403
curl -X POST ... -H "Authorization: Bearer $KAPRODI_TOKEN" ...

# 3. INTEGER salah → 400; baris sebelum = sesudah (rollback)
curl -X POST ... -d '{"cells":[{"columnId":"<colNo>","value":"abc"}]}'

# 4. Node grup → 400; 5. duplikat columnId → 400

# 6. Sheet tidak ada → 404; 7. bukan UUID → 400; 8. tanpa token → 401

# 9. URL tidak valid → 400
curl -X POST ... -d '{"cells":[{"columnId":"<colLink>","value":"bukan-url"}]}'

# 10. GET /rows setelah 201 → baris baru ada di akhir
```
