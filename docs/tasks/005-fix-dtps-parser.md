# 005 — Fix DTPS Parser: Kolom Merge-Vertikal Null

## Tujuan
Memperbaiki pembacaan data DTPS di mana kolom No., Nama Dosen, dan Jabatan Akademik
selalu null di semua 24 baris hasil import.

## Gejala
- Terisi benar: Magister, Doktor, NIDN, Link Dokumen.
- Null di SEMUA 24 baris: No., Nama Dosen, Jabatan Akademik.
- Persis kolom yang header-nya merge **vertikal**: A2:A3, B2:B3, E2:E3.

## Akar Masalah

`parseDtpsHeaders` membangun `mergeMap` dari semua merge yang dimulai di baris 2.
Ini mencakup dua jenis merge:

| Merge | Jenis | Dimaksudkan sebagai |
|---|---|---|
| `C2:D2` | Horizontal (endCol > startCol) | Node grup "Kualifikasi Akademik" ✅ |
| `A2:A3` | Vertikal (endCol = startCol) | Label header menjangkau 2 baris — BUKAN grup |
| `B2:B3` | Vertikal | Sama |
| `E2:E3` | Vertikal | Sama |

Karena `mergeMap` menyimpan merge vertikal, kondisi `mergeEnd !== undefined` terpenuhi
untuk kolom A, B, E. Kode masuk ke cabang **grup** (`isGroup: true`). Loop sub-header
di baris 3 untuk kolom ini menemukan slave cell (merge) → tidak ada anak ditambahkan →
kolom akhirnya menjadi grup tanpa anak.

Kemudian `parseDtpsDataRows` memfilter `leafCols = colDefs.filter(c => !c.isGroup)` →
kolom No./Nama Dosen/Jabatan Akademik **tidak masuk** ke leafCols → Cell tidak pernah
dibuat → null di semua baris.

## Fix (`src/imports/imports.service.ts`)

Satu kondisi tambahan saat mengisi `mergeMap`:

```typescript
// SEBELUM (salah):
mergeMap.set(colLetterToNum(sm[1]), colLetterToNum(em[1]));

// SESUDAH (benar):
const startCol = colLetterToNum(sm[1]);
const endCol   = colLetterToNum(em[1]);
if (endCol <= startCol) continue; // abaikan merge vertikal
mergeMap.set(startCol, endCol);
```

Merge vertikal (`A2:A3`, `B2:B3`, `E2:E3`) tidak masuk `mergeMap` → diperlakukan
sebagai leaf biasa → `getCell(colIndex)` di baris data membaca nilainya dengan benar.

## Bedakan: jalur pohon vs jalur baca-data

| Jalur | Kode | Pengaruh merge |
|---|---|---|
| Pohon kolom (header) | `parseDtpsHeaders` | Merge horizontal → grup; merge vertikal → leaf |
| Baca data (Cell) | `parseDtpsDataRows` | `getCell(col.colIndex)` — indeks Excel absolut, tidak peduli merge |

Merge vertikal hanya memengaruhi **tampilan header** di Excel (cell A2 melebar ke A3).
Saat membaca data di baris 4–27, kolom A tetap kolom A (indeks 1) — merge tidak
menggeser indeks kolom.

## Kenapa Baru Ketahuan Setelah Fix Sebelumnya?

Fix sebelumnya (004-import-multisheet / bug grup-vs-leaf) memisahkan `groupColIdMap`
dan `leafColIdMap`. Perbaikan itu benar untuk kasus Doktor/Magister, tapi tidak
mengubah kode `mergeMap` — bug merge vertikal sudah ada sebelumnya, hanya tersembunyi
karena pada test sebelumnya belum ada file DTPS nyata yang diverifikasi baris datanya.

## Verifikasi
Setelah import ulang file DTPS:
- Baris 1: No=`1`, Nama Dosen=`Anas Puji Santoso, Ir., M.T.`, Jabatan=`Lektor`,
  NIDN=`0017026012`, Magister=`Teknik Perminyakan`, Doktor=`-`
- Tidak ada null di kolom No / Nama Dosen / Jabatan Akademik di baris mana pun
- Total 24 baris, tidak ada baris hantu ke-25
