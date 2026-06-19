# 004 — Import Excel → DTPS: `POST /imports`

## Tujuan
Admin mengunggah satu workbook Excel LAMTEK; sistem mem-parse sheet "Data Dosen Tetap"
menjadi pohon kolom + baris + cell yang tersimpan di DB — semuanya dalam satu transaksi
atomik. Hanya DTPS yang di-parse (57 sheet lain = Sprint 2).

## Rencana singkat
1. Install `exceljs` (parse Excel) + `@types/multer`.
2. Buat `ImportsService` dengan logika parse + transaksi DB.
3. Buat `ImportsController` dengan `FileInterceptor` (Multer, memory storage).
4. Isi `ImportsModule`.

## File diubah / dibuat

| File | Alasan |
|---|---|
| `src/imports/imports.service.ts` | **Baru** — logika parse ExcelJS + transaksi Prisma |
| `src/imports/imports.controller.ts` | **Baru** — endpoint POST /imports, FileInterceptor |
| `src/imports/imports.module.ts` | Diisi (sebelumnya stub kosong) |
| `package.json` + `pnpm-lock.yaml` | Tambah `exceljs` + `@types/multer` |

## Keputusan kunci

### Package manager
Project memakai **pnpm** (ada `pnpm-lock.yaml`). Install dengan `npm install` tidak bekerja;
harus pakai `pnpm add exceljs` dan `pnpm add -D @types/multer`.

### storagePath = placeholder
Schema `ExcelImport.storagePath String` wajib diisi tapi file tidak dipersist ke storage
di Sprint 1 (parse → langsung ke DB, file dibuang dari memori). Field diisi `'not-persisted'`
sebagai placeholder. Sprint 2: simpan file ke object storage dan isi path nyata.

### `as any` untuk Buffer
Node.js 24 mengubah tipe `Buffer` menjadi generik (`Buffer<ArrayBufferLike>`) sementara
ExcelJS ditulis untuk tipe lama. Solusi: cast `file.buffer as any` untuk menghindari error
tipe tanpa mengubah perilaku runtime.

## Belajar dari sini

### Merge header Excel → pohon kolom (`parentColumnId`)
Di Excel, "Kualifikasi Akademik" di sel C2 di-*merge* ke D2 (`C2:D2`). Artinya: satu
header mencakup dua kolom. ExcelJS menyimpan info ini di `worksheet.model.merges` sebagai
array string `["C2:D2", ...]`.

Parser membaca merge ini → membuat Column induk "Kualifikasi Akademik" (`parentColumnId = null`,
`type: TEXT` karena kolom non-nullable di schema), lalu membaca baris 3 (sub-header) di kolom
C dan D untuk mendapat "Magister" dan "Doktor" sebagai anak (`parentColumnId = id induk`).
Frontend membedakan grup dari daun bukan dari `type`, melainkan dari ada/tidaknya `children`
di respons `GET /sheets/:id/columns`.

### Kenapa NIDN dibaca `cell.text` bukan `cell.value`?
ExcelJS menyimpan nilai numerik di `cell.value` sebagai number. NIDN `0017026012` yang
diformat sebagai angka di Excel akan menjadi `17026012` (nol depan hilang). `cell.text`
mengembalikan nilai **seperti yang ditampilkan** di Excel — termasuk nol di depan jika
sel diformat sebagai teks. **Menggunakan `cell.text` untuk semua cell adalah cara paling
aman mempertahankan nol depan. Ini DoD #4 Sprint 1.**

### Kenapa data dibatasi sampai baris kosong pertama?
File Excel LAMTEK punya konten di luar area tabel:
- Baris 4–27: 24 baris data DTPS
- **Baris 34, kolom B: `"<<< Daftar Sheet"`** (navigasi internal workbook)

Jika kita membaca "sampai baris tidak kosong terakhir", sel B34 terbaca sebagai baris ke-25
— "baris hantu" yang bukan data dosen. Solusi: berhenti di baris data kosong pertama
(No. dan Nama Dosen keduanya kosong). Ini memotong pembacaan sebelum B34.

### Struktur Map yang dibuat
Mengikuti pola seed yang sudah ada:
```
MenuItem "LAMTEK" (parentId = parentMenuId|null)
  └─ MenuItem "Data Dosen Tetap" (parentId = "LAMTEK")
       └─ Sheet (menuItemId = MenuItem "Data Dosen Tetap")
```
Tiap sheet menempel ke **satu** MenuItem via `menuItemId`. Ini konsisten dengan cara
seed membuat `menu DTPS → sheet DTPS`.

### Kenapa seluruh import dalam satu transaksi?
Import membuat: ExcelImport + 2 MenuItem + Sheet + 8 Column + 24 Row + ~168 Cell + 1 ChangeLog.
Jika transaksi tidak dipakai dan gagal di tengah (mis. constraint unique Column gagal di kolom
ke-5), kita bisa punya MenuItem + Sheet tanpa kolom sama sekali — data parsial yang tidak bisa
dipakai tapi juga tidak bisa di-detect mudah. Transaksi menjamin: berhasil semua atau tidak sama
sekali. Kalau gagal → rollback penuh → tidak ada sisa data.

## Cara verifikasi

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 2. Upload file
RESP=$(curl -s -X POST http://localhost:3000/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/ke/Final_Lampiran_Dokumen.xlsx" \
  -F "name=LAMTEK")
echo $RESP  # → {"importId":"...","workbookMenuId":"...","sheetId":"...","rowCount":24}
SHEET_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['sheetId'])")

# 3. Cek menu tree
curl -s http://localhost:3000/menus -H "Authorization: Bearer $TOKEN"
# → node "LAMTEK" → anak "Data Dosen Tetap"

# 4. Cek kolom
curl -s http://localhost:3000/sheets/$SHEET_ID/columns -H "Authorization: Bearer $TOKEN"
# → Kualifikasi Akademik (children: Magister, Doktor); NIDN type TEXT

# 5. Cek baris — BUKTI UTAMA
curl -s "http://localhost:3000/sheets/$SHEET_ID/rows" -H "Authorization: Bearer $TOKEN"
# → 24 baris; NIDN "0017026012" nol-depan utuh; TIDAK ada baris ke-25

# Negatif
# KAPRODI → 403; tanpa token → 401
# File .txt → 400; file xlsx korup → 422
```

## Catatan Sprint 2
- Parse 57 sheet lain (selain DTPS)
- Simpan file Excel ke object storage (isi `storagePath` nyata)
- Dedup re-import / preview konfirmasi sebelum commit
- Hitung kolom formula
