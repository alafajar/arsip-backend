# 010 — Smoke-test runtime Sprint 1

## Tujuan
Membuktikan semua jalur Sprint 1 benar-benar jalan secara runtime — login, menu, sheet, CRUD baris, dan semua tes negatif — sebelum fitur Sprint 2 ditumpuk.

## Rencana singkat
1. Jalankan server (`npm run start:dev`) di background.
2. Login admin → simpan `accessToken`.
3. Login kaprodi → simpan token.
4. GET /menus — cek pohon hierarki.
5. GET /sheets/:id — DTPS (writable) dan grid-mirror EWMP (isReadOnly).
6. GET /sheets/:id/columns dan /rows — cek bentuk respons.
7. CRUD baris sebagai admin: POST/PATCH/DELETE.
8. Tes negatif: 401, 403, 409, 404, 400.

## Hasil smoke-test

### S1 — Login admin ✅
```
POST /auth/login  →  HTTP 201
{ accessToken: <jwt>, user: { role: "ADMIN" } }
```

### S2 — Login kaprodi ✅
```
POST /auth/login  →  HTTP 201
{ accessToken: <jwt>, user: { role: "KAPRODI" } }
```

### S3 — GET /menus ✅
```
GET /menus  →  HTTP 200
Pohon: Kriteria > DTPS (1 sheet), Kriteria > Profil Dosen,
       Kurikulum > Final Lampiran Dokumen > 50+ submenu
```

### S4a — GET /sheets/00000000-0000-0000-0002-000000000001 (DTPS, writable) ✅
```json
{
  "id": "00000000-0000-0000-0002-000000000001",
  "name": "DTPS",
  "orderIndex": 0,
  "isReadOnly": false,
  "menuItem": { "id": "00000000-0000-0000-0001-000000000002", "name": "DTPS" }
}
```
`merges` tidak muncul → benar (hanya untuk isReadOnly sheet).

### S4b — GET /sheets/6802b9cd-b864-44f6-af9a-9b7df13f41b3 (21. EWMP, isReadOnly=true) ✅
```json
{
  "id": "6802b9cd-b864-44f6-af9a-9b7df13f41b3",
  "name": "21. EWMP",
  "isReadOnly": true,
  "merges": [ ... 12 entri ... ]
}
```
`merges` muncul dan berisi 12 entri → benar.

### S5a — GET /sheets/:id/columns (DTPS) ✅
```
Pohon kolom: No.(INTEGER), Nama Dosen(TEXT),
  Kualifikasi Akademik(TEXT) > [Magister(TEXT), Doktor(TEXT)],
  Jabatan Akademik(TEXT), NIDN(TEXT), Link Dokumen(URL)
```
Hierarki dua tingkat terbentuk dengan benar.

### S5b — GET /sheets/:id/rows (DTPS) ✅
```json
{ "rows": [...3 baris...], "total": 3, "limit": 50, "offset": 0 }
```
Bentuk `{rows,total,limit,offset}` ✓.
NIDN "0017026012" nol-di-depan utuh ✓.
Sel kosong → null ✓ (mis. baris 2 kolom Doktor).

### S6a — POST /sheets/:id/rows (buat baris baru) ✅
```
POST /sheets/00000000-0000-0000-0002-000000000001/rows
Body: { cells: [{columnId, value}, ...] }  →  HTTP 201
rowId baru: b835a666-ad4b-42ce-a7f5-c06711a049b8, orderIndex: 4
```

### S6b — PATCH /sheets/:id/rows/:rowId (ubah baris) ✅
```
PATCH /sheets/.../rows/b835a666-...  →  HTTP 200
Nama Dosen diupdate ke "Smoke Test Dosen UPDATED" → terverifikasi di respons
```

### S6c — DELETE /sheets/:id/rows/:rowId (hapus baris) ✅
```
DELETE /sheets/.../rows/b835a666-...  →  HTTP 200
{ "deleted": true, "rowId": "b835a666-ad4b-42ce-a7f5-c06711a049b8" }
```

### N1 — Tanpa token → 401 ✅
```
GET /menus (tanpa Authorization header)  →  HTTP 401
```

### N2 — Kaprodi tulis baris → 403 ✅
```
POST /sheets/.../rows (token KAPRODI)  →  HTTP 403
{ "message": "Forbidden", "statusCode": 403 }
```

### N3 — Tulis ke sheet isReadOnly → 409 ✅
```
POST /sheets/6802b9cd-.../rows (token ADMIN, sheet EWMP isReadOnly)  →  HTTP 409
{ "message": "Sheet ini hanya-baca dan tidak bisa diubah", "error": "Conflict" }
```

### N4 — UUID valid tapi tidak ada → 404 ✅
```
GET /sheets/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/rows  →  HTTP 404
{ "message": "Sheet tidak ditemukan", "error": "Not Found" }
```

### N5 — ID bukan UUID → 400 ✅
```
GET /sheets/bukan-uuid/rows  →  HTTP 400
{ "message": "Validation failed (uuid is expected)", "error": "Bad Request" }
```

## Bug ditemukan
**Tidak ada bug produksi.** Satu temuan minor saat pengujian:

> **Catatan format DTO**: `POST /sheets/:id/rows` menerima `cells` sebagai **array** `[{columnId, value}]`
> bukan objek `{columnId: value}`. Ini sudah benar sesuai desain DTO, tapi dokumentasi Swagger
> perlu memastikan contoh request jelas — bukan bug, hanya UX Swagger.

## File diubah
Tidak ada perubahan kode produksi (tugas verifikasi murni).

## Keputusan kunci
- **Grid-mirror** = sheet dengan `isReadOnly=true` di DB. Diwakili oleh "21. EWMP" (`6802b9cd-...`).
- **DTPS seed** (`00000000-...`) dipakai untuk jalur CRUD karena punya kolom & baris yang diketahui.
- Login rate-limit (5x/menit) dikelola dengan single-session: 2 login (admin+kaprodi) lalu semua tes.

## Belajar dari sini

**Kenapa `cells` adalah array, bukan objek?**
DTO `CreateRowDto` memvalidasi setiap elemen sel secara individual via `@ValidateNested`.
Kalau menggunakan objek `{columnId: value}`, class-validator tidak bisa memvalidasi kunci dinamis.
Array `[{columnId, value}]` memungkinkan validasi struktural penuh: UUID wajib untuk columnId,
string opsional untuk value.

**Rate limiting login vs. token refresh**
Server membatasi `POST /auth/login` (5x/menit) tapi bukan endpoint data.
Dalam pengujian otomatis: login sekali, simpan token, gunakan untuk semua request.
Token JWT 15 menit cukup untuk satu sesi tes.

**Urutan cek kegagalan di tes negatif**
- N2 (403) diuji dengan kaprodi: Guard `@Roles(Role.ADMIN)` menolak sebelum service dipanggil.
- N3 (409) diuji dengan admin ke sheet readOnly: Guard lolos, service helper `assertWritableSheet` menolak.
- Urutan ini membuktikan dua lapis pertahanan: authorization di Guard, business rule di service.
