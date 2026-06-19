# 004 (revisi) — Import Multi-Sheet: `POST /imports`

## Tujuan
Memperluas import Excel dari DTPS-only menjadi **semua sheet**: sheet DTPS menggunakan
parser semantik (pohon kolom + tipe), sheet lain menggunakan parser cermin grid (posisional,
read-only). Satu upload = satu workbook + semua sheet-nya masuk DB dalam satu transaksi.

## Perubahan schema
`Sheet.isReadOnly Boolean @default(false)` — ditambah untuk membedakan sheet yang dapat
diedit (DTPS semantik) dari sheet cermin yang hanya bisa dibaca.

**Migrasi:** `20260619_add_sheet_isreadonly` via `npx prisma migrate dev`.

## File diubah

| File | Alasan |
|---|---|
| `prisma/schema.prisma` | Tambah `Sheet.isReadOnly` |
| `src/imports/imports.service.ts` | Rewrite: dua jalur parser, loop semua sheet |
| `src/imports/imports.controller.ts` | Update pemanggilan metode `importWorkbook` |
| `src/sheets/sheets.service.ts` | Tambah `isReadOnly` ke select `findById` |

## Keputusan kunci

- Seluruh parsing Excel (CPU) dilakukan **sebelum** transaksi DB; transaksi hanya berisi
  operasi DB. Ini meminimalkan durasi transaksi.
- Timeout transaksi dinaikkan ke 120 detik untuk file besar dengan banyak sheet.
- `writeDtpsToTx` dan `writeGridToTx` menggunakan `tx: any` karena Prisma v7 (Rust-free)
  tidak mengekspor `TransactionClient` secara langsung; type safety tetap terjaga di level
  query-level melalui inferensi TypeScript.

## Belajar dari sini

### Dua jalur parser: semantik vs cermin grid

**Semantik (DTPS):** Parser *memahami* struktur — header 2 baris, merge "Kualifikasi
Akademik", tipe kolom (INTEGER/TEXT/URL), batas baris kosong untuk menghindari B34.
Hasilnya: pohon kolom + cell yang bisa diedit via `POST/PATCH /sheets/:id/rows`.
`Sheet.isReadOnly = false`.

**Cermin grid:** Parser *tidak memahami* struktur — baca used range apa adanya.
Semua kolom bertipe TEXT dengan nama huruf Excel (A, B, C…). Tidak ada batas baris
khusus. Hasil: representasi visual sheet yang bisa ditampilkan tapi tidak diedit via
API. `Sheet.isReadOnly = true`. Frontend bisa menyembunyikan nama kolom A/B/C dan
menampilkan header sesungguhnya (yang tersimpan sebagai baris data paling atas).

### Kenapa cermin grid tidak menebak header?
Sheet non-DTPS memiliki format yang sangat beragam. Menebak baris mana yang "header"
membutuhkan heuristik yang rapuh (baris pertama? baris dengan bold? baris merged?).
Untuk Sprint 1 yang read-only, tidak ada kebutuhan bisnis untuk memahami headernya —
cukup tampilkan apa adanya. Sprint 2 akan menambahkan fitur "promote cermin → semantik"
di mana admin secara eksplisit mendefinisikan header.

### Pemakaian `CellMerge` untuk merge tampilan
Ini **pertama kalinya** `CellMerge` dipakai sesuai tujuannya: menyimpan koordinat
merge (`startRow`, `endRow`, `startCol`, `endCol`) untuk sheet cermin. Saat frontend
merender tabel, ia perlu tahu sel mana yang di-merge agar bisa menerapkan `rowspan`/
`colspan` yang tepat. Untuk DTPS semantik, merge sudah diterjemahkan ke `parentColumnId`
(pohon kolom) — `CellMerge` tidak dipakai untuk header.

### Formula → nilai cached sebagai teks
Sel formula (`=A1+B1`) disimpan di Excel dengan dua bagian: formula itu sendiri dan
**cached result** (nilai terakhir saat file disimpan). ExcelJS membaca keduanya. `cell.text`
mengembalikan cached result sebagai string yang sudah diformat. Ini cukup untuk cermin
grid — tidak ada engine kalkulasi di backend. Jika cached result kosong (formula belum
pernah dihitung), `cell.text` mengembalikan `""` dan cell tidak dibuat.

### Anti-N+1 untuk sheet besar
- Kolom: `createMany` satu batch per sheet
- Baris: `createMany` satu batch (UUID di-generate di JS dengan `randomUUID()`)
- Cell: `createMany` satu batch per sheet
- `CellMerge`: `createMany` satu batch per sheet

Untuk file dengan 60 sheet × 1000 baris × 20 kolom = 1.2 juta cell, total jumlah
query DB adalah O(jumlah sheet), bukan O(jumlah cell).

## Cara verifikasi

```bash
TOKEN=<dari POST /auth/login admin>

# Upload file (beberapa sheet)
curl -X POST http://localhost:3000/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/ke/Final_Lampiran_Dokumen.xlsx" \
  -F "name=LAMTEK"
# → { importId, workbookMenuId, sheets: [{sheetId, name, isReadOnly}, ...] }

# GET /menus → workbook "LAMTEK" + semua sheet sebagai anak

# Sheet DTPS (isReadOnly=false):
# GET /sheets/<dtpsId>/columns → pohon kolom, NIDN type TEXT
# GET /sheets/<dtpsId>/rows → 24 baris, NIDN nol-depan utuh

# Sheet cermin (isReadOnly=true, mis. EWMP):
# GET /sheets/<cerminId>/columns → kolom A,B,C... semua TEXT
# GET /sheets/<cerminId>/rows → isi apa adanya

# Negatif: KAPRODI→403; tanpa token→401; .txt→400; xlsx korup→422
```

## Catatan Sprint 2
- CRUD / edit pada sheet cermin (promote cermin → semantik)
- Simpan file Excel ke object storage (`storagePath` nyata)
- Endpoint GET untuk `CellMerge` (kirim data merge ke frontend untuk rowspan/colspan)
- Dedup re-import / preview konfirmasi
