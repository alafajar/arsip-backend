# 012 — Verifikasi alur impor opsi B

## Tujuan
Memastikan `POST /imports` membuat folder dari nama file di bawah `parentMenuId`,
dengan setiap sheet menjadi MenuItem anak folder tersebut — tanpa mengubah kode
kecuali ada penyimpangan.

## Rencana singkat
1. Telusuri `imports.service.ts` secara statis — konfirmasi opsi B.
2. Buat file Excel minimal untuk tes.
3. Uji runtime: upload dengan `parentMenuId` → cek `GET /menus`.
4. Uji runtime: upload tanpa `parentMenuId` (akar) → cek `GET /menus`.
5. Tes negatif: `parentMenuId` tak ada (404), non-.xlsx (400), file rusak (422).

## Konfirmasi statis opsi B (imports.service.ts)

| Aspek | Baris | Hasil |
|-------|-------|-------|
| parentMenuId sbg induk workbook | 210–221 | ✅ `parentId: parentMenuId ?? null` |
| Nama workbook dari name atau filename | 194 | ✅ `name?.trim() \|\| originalname.replace(/.xlsx/, '')` |
| Sheet jadi MenuItem anak workbook | 233–241 | ✅ `parentId: wbMenu.id` |
| orderIndex rapi | 212, 248 | ✅ `max+1` untuk workbook, `i+1` untuk sheet |
| Unggah tanpa parentMenuId → top-level | 211 | ✅ `parentId: null` |

Tidak ada penyimpangan statis — lanjut ke tes runtime.

## Hasil runtime

### T1 — Upload dengan parentMenuId (Kriteria) ✅
```
POST /imports  (parentMenuId = Kriteria)
HTTP 201
importId: 15a4e4b8-...
workbookMenuId: eed1af42-...
sheets: ["Smoke Sheet A" (isReadOnly:true), "Smoke Sheet B" (isReadOnly:true)]
```
Struktur menu setelah upload:
```
Kriteria
  └── smoke-test-minimal          ← folder dari nama file (opsi B ✓)
        ├── Smoke Sheet A (1 sheet)
        └── Smoke Sheet B (1 sheet)
```
Breadcrumb `GET /menus/:id/path`:
```json
[{"id":"...Kriteria","name":"Kriteria"}, {"id":"...workbook","name":"smoke-test-minimal"}]
```

### T2 — Upload TANPA parentMenuId (akar) ✅
```
POST /imports  (tanpa parentMenuId)
HTTP 201
workbookMenuId: 18dc2c9d-...
```
Workbook muncul sebagai root node:
```
Kriteria (root)
Kurikulum (root)
smoke-test-minimal (root)  ← top-level ✓
```
Breadcrumb: `[{"name":"smoke-test-minimal"}]` (1 item saja, tanpa parent).

### N1 — parentMenuId UUID valid tapi tidak ada → 404 ✅
```
{"message":"Node induk tidak ditemukan","statusCode":404}
```

### N2 — File .txt bukan .xlsx → 400 ✅
```
{"message":"Hanya file .xlsx yang diizinkan.","statusCode":400}
```

### N3 — File .xlsx header palsu / rusak → 422 ✅
```
{"message":"File Excel tidak valid atau rusak.","statusCode":422}
```

## Bug ditemukan
Tidak ada. Implementasi opsi B sudah sesuai spec.

## File diubah
- `samples/smoke-test-minimal.xlsx` — file tes Excel minimal (2 sheet), tidak dicommit

## Belajar dari sini

**Kenapa folder dari nama file, bukan dari nama parameter `name`?**
`name` opsional — kalau tidak diisi, sistem jatuh ke `file.originalname` tanpa ekstensi.
Ini konsisten dengan konvensi file manager: "folder bernama seperti file yang diunggah".
Kalau `name` diisi, itu yang dipakai (misalnya "Data Dosen Tetap S1" vs "Final Lampiran Dokumen.xlsx").

**Kenapa grid sheet selalu `isReadOnly: true`?**
Grid mirror merekam tata letak visual Excel persis-pixel (baris, kolom, merge).
Data ini tidak dirancang untuk diedit manual — source of truth-nya tetap file Excel.
DTPS (`isReadOnly: false`) adalah satu-satunya sheet yang punya struktur semantik
(header bertingkat, tipe kolom) dan memang untuk diedit via API.

**Urutan transaksi: parse dulu, tulis belakangan**
ExcelJS parsing terjadi SEBELUM transaksi Prisma dibuka.
Kalau parsing gagal (file rusak), tidak ada transaksi yang dimulai — fail-fast tanpa rollback.
Kalau parsing berhasil tapi DB write gagal, seluruh transaksi di-rollback — konsistensi terjaga.
