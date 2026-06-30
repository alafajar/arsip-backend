# 021 — Agregat Vertikal (Total Kolom / Footer)

## Tujuan
Tambahkan kemampuan menyimpan definisi agregat (SUM/AVERAGE/COUNT/MAX/MIN) per kolom
pada sebuah sheet, dan hitung nilainya saat read rows — dikembalikan sebagai `aggregates`
terpisah dalam respons, bukan sebagai baris data.

## Rencana Singkat
1. Tambah enum `AggregateOp` + model `SheetAggregate` di schema Prisma; migrasi.
2. Buat modul `src/aggregates/` dengan CRUD (POST, DELETE, GET).
3. Modifikasi `SheetsService.getRows` untuk menyertakan nilai agregat.
4. Daftarkan `AggregatesModule` di `AppModule`.

## File Diubah
- `prisma/schema.prisma` — tambah `AggregateOp` enum + `SheetAggregate` model + relasi
- `src/aggregates/aggregates.module.ts` — modul baru
- `src/aggregates/aggregates.service.ts` — logika CRUD + validasi + komputasi on-demand
- `src/aggregates/aggregates.controller.ts` — endpoint REST
- `src/aggregates/dto/create-aggregate.dto.ts` — DTO buat agregat
- `src/sheets/sheets.service.ts` — `getRows` menyertakan `aggregates` dalam respons
- `src/app.module.ts` — import `AggregatesModule`

## Keputusan Kunci
- K3 (terkunci): agregat = entitas tingkat-sheet, dihitung saat read, dikembalikan sebagai footer.
- `AggregateOp` enum terpisah dari `FormulaOp` — hanya 5 op vertikal (SUM, AVERAGE, COUNT, MAX, MIN).
- COUNT menghitung sel non-kosong (bukan hanya numerik) — semantik berbeda dari formula horizontal.
- Numeric ops (SUM, AVERAGE, MAX, MIN) hanya untuk kolom bertipe INTEGER atau FLOAT → 400 jika tidak.
- Hanya kolom daun (leaf, tanpa anak) yang dapat diagregasi.
- Nilai agregat dihitung dari SEMUA baris (bukan hanya halaman aktif).
- Unique constraint: satu (sheetId, targetColumnId, op) — cegah duplikat definisi.
- readonly sheet → 409 (sama seperti kolom dan baris).

## Belajar dari Sini
Pola "computed field saat read" ini adalah alternatif untuk menyimpan hasil kalkulasi di DB:
daripada menyimpan total ke tabel, kita simpan *definisi* saja dan hitung saat API dipanggil.
Keuntungan: nilai selalu akurat (tidak basi), tidak ada sync issue.
Kelemahannya: komputasi tambahan per request — diterima selama data tidak jutaan baris.
Ini konsisten dengan kolom formula horizontal yang juga tidak disimpan nilainya ke DB.
