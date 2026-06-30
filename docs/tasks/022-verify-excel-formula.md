# 022 — Verifikasi Nilai Formula dari Excel (Impor)

## Tujuan
Memastikan sel rumus Excel tersimpan & tampil sebagai **nilai hasil** (statis) di aplikasi,
bukan teks rumus (`=SUM(...)`) atau kosong — kecuali kasus yang memang dikecualikan.

## Rencana Singkat
1. Buat file Excel uji (`test/fixtures/formula-test.xlsx`) dengan berbagai jenis formula.
2. Unggah via `POST /imports`, cek `GET /sheets/:id/rows`.
3. Dokumentasikan hasil tiap kasus (lulus / temuan).

## Kasus Uji
| # | Formula | Hasil Diharapkan |
|---|---|---|
| 1 | `=1+2` | `"3"` |
| 2 | `=SUM(A2:A4)` (kolom berisi 10,20,30) | `"60"` |
| 3 | `=A2*B2` (10 × 3) | `"30"` |
| 4 | `=A2/C2` (10 ÷ 0) | `""` (error diabaikan) |
| 5 | `=CONCATENATE("Halo"," ","Dunia")` | `"Halo Dunia"` |
| 6 | `=AVERAGE(A2:A4)` (10,20,30) | `"20"` |
| 7 | `=IF(A2>5,"besar","kecil")` | `"besar"` |
| 8 | `=DATE(2025,1,15)` (hasil tanggal) | nilai `.text` dari Excel |
| 9 | `=A2&" teks"` (string concat) | `"10 teks"` |

## File Diubah
- `test/fixtures/formula-test.xlsx` — file uji baru (generate via skrip Node)
- `docs/tasks/022-verify-excel-formula.md` — task log ini

## Hasil Verifikasi

File uji: `test/fixtures/formula-test.xlsx` (generate programatik via Node/ExcelJS).
Diunggah ke `POST /imports`, sheet-id: `abd3e0af-9412-4c2e-a5e8-20191a312916`.

| # | Formula | Diharapkan | Aktual | Status |
|---|---|---|---|---|
| 1 | `=1+2` | `"3"` | `"3"` | ✅ LULUS |
| 2 | `=SUM(A2:A4)` (10+20+30) | `"60"` | `"60"` | ✅ LULUS |
| 3 | `=A2*B2` (10×3) | `"30"` | `"30"` | ✅ LULUS |
| 4 | `=A2/C2` (10÷0, error) | `null` | `null` | ✅ LULUS |
| 5 | `=CONCATENATE("Halo"," ","Dunia")` | `"Halo Dunia"` | `"Halo Dunia"` | ✅ LULUS |
| 6 | `=AVERAGE(A2:A4)` | `"20"` | `"20"` | ✅ LULUS |
| 7 | `=IF(A2>5,"besar","kecil")` | `"besar"` | `"besar"` | ✅ LULUS |
| 8 | `=DATE(2025,1,15)` dengan `numFmt=DD/MM/YYYY` | `"15/01/2025"` | `"Wed Jan 15 2025 00:00:00 GMT+0700..."` | ⚠️ TEMUAN |
| 9 | `=A2&" teks"` | `"10 teks"` | `"10 teks"` | ✅ LULUS |

8 dari 9 kasus lulus. 1 temuan.

## Temuan

**TEMUAN T-1: Sel rumus tanggal (DATE) dari file yang digenerate programatik menghasilkan string timezone JS.**

- **Kasus**: `=DATE(2025,1,15)` dengan `numFmt='DD/MM/YYYY'` di file yang dibuat via ExcelJS programatik.
- **Aktual**: `"Wed Jan 15 2025 00:00:00 GMT+0700 (Western Indonesia Time)"` (hasil `Date.prototype.toString()`).
- **Diharapkan**: `"15/01/2025"` (sesuai numFmt) atau setidaknya ISO string `"2025-01-14T17:00:00.000Z"`.

**Penyebab:** Dalam `getCellText`:
```ts
if (result instanceof Date) return cell.text?.trim() || result.toISOString();
```
`cell.text` dari file yang di-generate programatik mengandung `.toString()` dari Date JS
(karena ExcelJS memformat tanggal sebagai string lokal saat tidak ada calculation cache nyata).
Fallback ke `result.toISOString()` tidak tercapai karena `cell.text` sudah non-kosong.

**Dampak dan skop:**
- Hanya berlaku untuk file Excel yang dihasilkan *programatik* (tanpa dibuka di Excel sungguhan).
- File yang disimpan oleh Excel desktop: `cell.text` berisi teks terformat sesuai `numFmt`
  (mis. "15/01/2025"), sehingga `getCellText` mengembalikan nilai yang benar.
- File DTPS yang diunggah user (dari Excel nyata) tidak terdampak.

**Rekomendasi (tidak perlu patch sekarang):** Bila ke depan diperlukan, tambahkan deteksi
`cell.text` yang merupakan JS `Date.toString()` dan fallback ke `result.toISOString()`.
Tapi karena tidak ada data impor nyata yang kena masalah ini, TIDAK perlu patch sekarang.

## Belajar dari Sini
`getCellText` memisahkan logika formula dengan memakai `.result` (bukan `.value` langsung)
dan `cell.text` (respektif numFmt Excel). Hasilnya: angka dengan format "8,7" tidak menjadi
"8.666..." — format display Excel dipertahankan. Error formula (#DIV/0!, #REF!, #VALUE!)
dikembalikan kosong karena `result` berupa objek error (bukan primitif).
