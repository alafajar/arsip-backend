# Analisa: Hasil import `.xlsx` tidak sama dengan Excel (grid-mirror sheet)

> Handoff lintas-repo. **Akar masalah ada di `arsip-backend`**, bukan render frontend.
> Frontend (`arsip-frontend`) merender setia sesuai kontrak API; ada satu band-aid opsional FE.
> Terkait: `docs/sprint2-backend-needs.md` entri **#9** — pekerjaan ini ditarik dari Sprint 2 ke
> Sprint 1 karena tujuan "import & view sama persis dengan yang diunggah".

## Gejala (sheet "20. Pembimbing TA")

Bandingkan screenshot Excel asli vs hasil render web:

1. **Header bertingkat hilang → jadi baris data + kolom huruf A–O.**
   Di Excel header membentang bertingkat: `Jumlah Mahasiswa yang Dibimbing` (C–J) →
   `pada PS yang Diakreditasi 3)` (C–F) & `pada PS Lain di PT 4)` (G–J) → `TS-2/TS-1/TS/Rata-rata`;
   `Nomor SK Penugasan Pembimbing` (L–N). Di web, header kolom justru `A B C … O` (huruf posisi),
   dan teks header Excel ("No.", "Nama Dosen 2)", "Jumlah Mahasiswa…", "TS-2", dst.) malah turun
   menjadi 3 baris data pertama.

2. **Kolom J menampilkan `[object Object]`** di setiap baris (kolom "Rata-rata" di bawah
   "pada PS Lain di PT 4)" — sel formula AVERAGE).

3. (Terkait fidelity) **Kolom K** menampilkan float panjang `8.666666666666666` padahal Excel
   menampilkan `8,7`.

## Diagnosis

### Sheet ini adalah grid-mirror, bukan DTPS

`arsip-backend/src/imports/imports.service.ts:158` — hanya worksheet yang namanya mengandung
`"data dosen tetap"` yang di-parse semantik (`parseDtpsHeaders`, membentuk pohon kolom asli).
Worksheet lain, termasuk `"20. Pembimbing TA"`, masuk jalur `parseGridSheet` (mirror posisional,
`isReadOnly: true`). Itu sebabnya sheet DTPS render benar tapi sheet ini tidak.

### Bug A — header jadi baris data + kolom A–O → **BACKEND** (bukan kegagalan render FE)

- `parseGridSheet` + `writeGridToTx` (`imports.service.ts:372-525`):
  - Kolom diberi nama huruf posisi via `colNumToLetter` (`writeGridToTx:483-496`), semua bertipe
    `TEXT`, **tanpa hierarki** (`parentColumnId: null`).
  - **Semua baris** dari `firstRow`..`lastRow` ditulis sebagai baris data (`writeGridToTx:500-507`),
    termasuk band header Excel (baris 2–4). Tidak ada deteksi "baris ini header".
- Merge metadata **sudah ditangkap** (`parseGridSheet:395-405`) dan **ditulis ke tabel `CellMerge`**
  (`writeGridToTx:519-524`) — **tetapi tidak diekspos** oleh API mana pun. Di
  `arsip-backend/src/sheets/sheets.service.ts`, `getColumns` (baris 20), `getRows` (baris 52), dan
  `findById` (baris 326) tidak mengembalikan merges.
- Frontend `src/features/sheets/lib/columns-to-coldef.tsx` **sudah mampu** render header bertingkat
  (terbukti di sheet DTPS), tapi untuk grid-mirror ia hanya menerima daftar kolom datar A–O — tak
  pernah menerima pohon kolom maupun merge ranges.

**Kesimpulan Bug A:** keterbatasan data dari backend (merge tidak dikirim, header band tidak
diberi makna), bukan bug render frontend.

### Bug B — `[object Object]` di kolom J → **BACKEND** (serialisasi sel formula)

`getCellText` (`imports.service.ts:77-89`):

```ts
function getCellText(cell: ExcelJS.Cell): string {
  if (!cell || cell.type === ExcelJS.ValueType.Null || cell.type === ExcelJS.ValueType.Merge) return '';
  const text = cell.text;
  if (text !== null && text !== undefined && String(text).trim() !== '') {
    return String(text).trim();
  }
  if (cell.value === null || cell.value === undefined) return '';
  return String(cell.value).trim();   // ← baris 88: BUG
}
```

- Untuk sel formula yang **tidak punya cached result** (`.text` kosong/whitespace), eksekusi jatuh
  ke baris 88: `String(cell.value)`. Di sini `cell.value` adalah objek formula
  `{ formula: 'AVERAGE(...)', result: undefined }` → `String({...})` menghasilkan **literal**
  `"[object Object]"`, yang lalu disimpan apa adanya ke `Cell.value` di DB.
- **Kolom K berhasil** karena formula-nya punya cached result sehingga `cell.text` resolve — tapi
  hasilnya float mentah panjang (`8.666...`), bukan `8,7` seperti format tampilan Excel. Jadi
  kolom K pun belum "sama persis".
- Ini melanggar kontrak `arsip-frontend/src/types/api.ts:55` yang menyatakan cell **selalu**
  `string | null`.

> ⚠️ **Data lama harus di-import ulang.** Nilai `"[object Object]"` sudah tersimpan permanen di DB.
> Memperbaiki kode tidak mengubah baris yang sudah ada — wajib re-import file setelah fix.

## Solusi backend

### Fix Bug B — `getCellText` (prioritas tinggi, kecil)

Tangani sel formula secara eksplisit (baca `result`), tangani error/Date, dan **jangan pernah**
`String()` sebuah objek. Untuk fidelity angka, utamakan teks terformat (`cell.text`) yang
menghormati number format Excel sebelum fallback ke nilai mentah.

```ts
function getCellText(cell: ExcelJS.Cell): string {
  if (!cell || cell.type === ExcelJS.ValueType.Null || cell.type === ExcelJS.ValueType.Merge) return '';

  // 1) Sel formula: ambil hasil cache, bukan objek formula.
  if (cell.type === ExcelJS.ValueType.Formula) {
    const result = (cell.value as ExcelJS.CellFormulaValue).result;
    if (result === null || result === undefined) return '';
    if (result instanceof Date) return cell.text?.trim() || result.toISOString();
    if (typeof result === 'object') return '';        // mis. { error: '#DIV/0!' } → kosongkan
    // angka/teks: pakai cell.text (hormati numFmt, mis. "8,7") bila ada, else nilai mentah
    const formatted = cell.text;
    return (formatted && String(formatted).trim()) || String(result).trim();
  }

  // 2) Non-formula: cell.text mempertahankan format (mis. NIDN "0017026012").
  const text = cell.text;
  if (text !== null && text !== undefined && String(text).trim() !== '') {
    return String(text).trim();
  }

  // 3) Fallback aman: jangan stringify objek.
  if (cell.value === null || cell.value === undefined) return '';
  if (typeof cell.value === 'object') return '';      // guard anti "[object Object]"
  return String(cell.value).trim();
}
```

Catatan: `getCellText` dipakai oleh jalur DTPS dan grid-mirror, jadi fix ini memperbaiki keduanya.

### Fix Bug A — ekspos `CellMerge` agar FE bisa merekonstruksi header

Data merge **sudah ada di DB** (tabel `CellMerge`, ditulis saat import). Cukup ekspos.

**Opsi yang disarankan:** tambahkan field `merges` pada response `GET /sheets/:id`
(`SheetsService.findById`, `sheets.service.ts:326`). Alternatif: endpoint terpisah
`GET /sheets/:id/merges`.

⚠️ **Normalisasi koordinat (krusial).** `CellMerge` disimpan dengan koordinat Excel **absolut**
(`startRow=2…`, `startCol=1…`, lihat `parseGridSheet:401-404`), sedangkan `Row.orderIndex` dan
`Column.orderIndex` ditulis **relatif** (`r - firstRow + 1`, `c - firstCol + 1`). Agar FE bisa
memetakan span ke grid, backend harus salah satu:

- **(a)** menormalkan merges ke skema orderIndex saat mengembalikan
  (`startRow -= firstRow - 1`, `startCol -= firstCol - 1`, dst.), **atau**
- **(b)** menyertakan `firstRow`/`firstCol` di response agar FE yang menggeser.

Opsi (a) lebih bersih bagi konsumen.

**Bentuk data yang diharapkan FE:**

```ts
// GET /sheets/:id  → SheetMeta diperluas (hanya untuk sheet isReadOnly)
interface CellMerge {
  startRow: number; endRow: number;  // 1-based, SELARAS Row.orderIndex
  startCol: number; endCol: number;  // 1-based, SELARAS Column.orderIndex
}
// tambahan field:
//   merges?: CellMerge[]
```

## Follow-up frontend (eksekusi terpisah, BUKAN bagian doc ini)

Setelah backend mengekspos merges, render grid-mirror setia di FE:

1. Tambah tipe `CellMerge` + perluas `SheetMeta` di `src/types/api.ts`.
2. Untuk sheet `isReadOnly`, render jalur grid khusus: **sembunyikan header huruf A–O**, render
   seluruh baris (termasuk band header Excel) sebagai grid biasa, terapkan `rowSpan`/`colSpan` dari
   merges, dan **lewati sel "merged-away"** (jangan tampilkan `—`). Konsumen:
   `src/features/sheets/components/SheetTable.tsx` dan transform di
   `src/features/sheets/lib/columns-to-coldef.tsx`.
3. **Band-aid opsional (boleh sekarang):** guard di
   `src/features/sheets/components/CellRenderer.tsx` agar nilai non-string tidak pernah tampil
   `[object Object]`. Ini hanya pelindung; nilai sebenarnya tetap harus datang dari fix backend Bug B.

Selaras dengan `docs/sprint2-backend-needs.md` entri #9 (kebutuhan ekspos `CellMerge`).

## Verifikasi (end-to-end)

1. Terapkan fix backend Bug B (+ ekspos merges Bug A), jalankan backend `:3000`, FE `:5173`.
2. **Re-import** file `.xlsx` yang sama (data lama menyimpan `"[object Object]"` — tidak otomatis
   terperbaiki).
3. Buka sheet hasil import:
   - Kolom J menampilkan angka (mis. `0` / `0,0`), **bukan** `[object Object]`.
   - Kolom K menampilkan nilai terformat (mis. `8,7`), bukan float panjang.
   - `GET /sheets/:id` mengembalikan `merges` dengan koordinat selaras `orderIndex`.
4. Setelah follow-up FE: band header ("Jumlah Mahasiswa yang Dibimbing", sub-grup, "TS-2/TS-1/…")
   tampil ter-merge persis seperti Excel; tidak ada header huruf A–O; tidak ada sel `—` di area merge.
