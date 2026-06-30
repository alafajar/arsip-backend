# 019 — Hitung formula horizontal saat read

## Tujuan
Isi nilai kolom formula di respons `GET /sheets/:id/rows`, dihitung saat read dari operand kolom lain.
Tolak penulisan cell ke kolom formula di `createRow` / `updateRow`.

## Rencana singkat
1. Tambah helper `computeFormula(op, values[])` — pure function, mudah di-tes.
2. Modifikasi `getRows`: fetch `formulaOp`+`formulaOperandIds` dari setiap kolom;
   setelah pivot cell, iterasi formula columns dan isi nilainya.
3. Modifikasi `createRow` + `updateRow`: fetch `formulaOp` saat validasi leaf,
   tolak cell yang menarget kolom formula → 400.

## Edge-case (didokumentasikan)
- SUM/ADD/AVERAGE/COUNT/MAX/MIN: operand kosong/non-angka → dilewati (dikecualikan).
- SUB/DIV: semua operand wajib angka valid → bila ada yang kosong/non-angka, hasil "".
- DIV dengan pembagi 0 → hasil "".
- MUL: kosong/non-angka dilewati (seperti SUM), sisa dikalikan.
- AVERAGE = sum valid / count valid.
- COUNT = jumlah operand yang berisi angka valid.
- Hasil diformat via `parseFloat(n.toPrecision(10)).toString()` — hindari noise float.

## Status HTTP penolakan formula write
400 (Bad Request): client mengirim payload yang tidak valid (menulis ke kolom non-writable).
409 dipakai untuk konflik state resource (sheet isReadOnly); 400 lebih tepat untuk payload salah.

## File diubah
- `src/sheets/sheets.service.ts` — helper `computeFormula`, update `getRows`, guard di `createRow`+`updateRow`
- `src/columns/dto/create-column.dto.ts` — tambah `formulaOp?` + `formulaOperandIds?` (validasi penuh di task 013)
- `src/columns/columns.service.ts` — teruskan formula fields ke `column.create`

## Hasil tes

| # | Setup | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| T1 | SUM(3, 1) | 4 | 4 | ✅ |
| T2 | SUM(0, 0) | 0 | 0 | ✅ |
| T3 | SUM(null, 5) — operand kosong dilewati | 5 | 5 | ✅ |
| T4 | SUM(teks, 10) — non-angka dilewati | 10 | 10 | ✅ |
| T5 | COUNT(teks, 10) | 1 | 1 | ✅ |
| T6 | DIV(teks, 10) — operand wajib non-angka | "" | "" | ✅ |
| T7 | DIV(0, 0) — pembagi nol | "" | "" | ✅ |
| T8 | DIV(10, 3) — float | 3.333333333 | 3.333333333 | ✅ |
| T9 | AVERAGE(null, 5) — skip kosong | 5 | 5 | ✅ |
| N1 | POST row dengan cell ke kolom formula | 400 | 400 + pesan | ✅ |
| N2 | PATCH row dengan cell ke kolom formula | 400 | 400 + pesan | ✅ |

## Belajar dari sini

**Computed-on-read vs disimpan**
Nilai formula tidak disimpan ke `cells` — dihitung ulang setiap kali `GET /rows` dipanggil.
Pro: selalu up-to-date bila operand berubah; tidak ada stale data.
Con: sedikit CPU per request. Untuk Sprint 2 ini tidak masalah; bila perlu di-cache nanti.

**Validasi tipe kolom mencegah "abc" di FLOAT**
`validateValueForType` menolak "abc" untuk kolom tipe FLOAT sebelum disimpan.
Sehingga non-angka hanya mungkin di kolom TEXT — edge case yang tetap harus ditangani
bila admin mencampur kolom TEXT sebagai operand formula numerik.

**`parseFloat(n.toPrecision(10)).toString()`**
`toPrecision(10)` membatasi 10 digit signifikan, lalu `parseFloat` menghapus trailing zero.
Hasilnya: `3.333333333` (bukan `3.3333333333333335` yang adalah floating-point noise).
Tanpa ini, `10/3` di JavaScript menghasilkan string yang panjang dan menjijikkan.

**Guard 400 bukan 409 untuk formula write**
409 = konflik state resource (sheet isReadOnly).
400 = payload tidak valid (menulis ke kolom yang tidak bisa ditulis).
Pesan error eksplisit menyebut "kolom formula" agar frontend bisa menampilkan pesan berguna.
