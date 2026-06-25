# 008 — Fix grid-mirror import: formula cells & ekspos merges

## Tujuan
Perbaiki dua bug pada jalur import grid-mirror sehingga hasil import setia dengan Excel:
1. **Bug B** — `getCellText` menulis `[object Object]` untuk sel formula tanpa cached result.
2. **Bug A** — koordinat `CellMerge` tersimpan absolut (tidak selaras `orderIndex`) dan
   tidak pernah dikembalikan oleh API.

## Rencana singkat
- Ganti implementasi `getCellText` agar menangani `ValueType.Formula` secara eksplisit.
- Normalisasi koordinat merge ke relatif (`orderIndex`) saat ditulis di `writeGridToTx`.
- Tambah field `merges` pada respons `findById` untuk sheet `isReadOnly`.

## File diubah

| File | Alasan |
|------|--------|
| `src/imports/imports.service.ts` | Fix `getCellText` (Bug B) + normalisasi merge coords (Bug A write) |
| `src/sheets/sheets.service.ts` | Ekspos `merges` di `findById` (Bug A read) |

## Keputusan kunci
- Normalisasi merge dilakukan **saat write** (bukan saat read) — `firstRow`/`firstCol` tersedia
  di `writeGridToTx`; tidak perlu menyimpan metadata ekstra di tabel `Sheet`.
- `merges` hanya dikembalikan untuk sheet `isReadOnly: true` (grid-mirror); sheet DTPS tidak
  punya `CellMerge`.
- Existing data yang mengandung `"[object Object]"` atau koordinat absolut **harus di-import
  ulang** — fix kode tidak mengubah data yang sudah ada di DB.

## Belajar dari sini
**ExcelJS formula cells**: `cell.value` untuk sel formula adalah objek
`{ formula: string, result: any }`, bukan string. `String({...})` menghasilkan
`"[object Object]"`. Selalu periksa `cell.type === ExcelJS.ValueType.Formula` dan ambil
`.result` — lalu pakai `cell.text` (yang sudah diformat oleh numFmt Excel) bila ada.

**Koordinat absolut vs. relatif**: ExcelJS melaporkan merge dalam koordinat baris/kolom Excel
absolut (mis. baris 2–4 = baris header). Tapi DB menyimpan Row/Column dengan `orderIndex`
relatif (1, 2, 3…). Tanpa normalisasi, frontend tidak bisa memetakan merge ke grid — baris
pertama di frontend selalu orderIndex=1, bukan angka baris Excel.
