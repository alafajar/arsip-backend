# 024 — Ekspos `formulaOp` & `formulaOperandIds` di `GET /sheets/:id/columns`

## Tujuan
Menutup TEMUAN T-1 dari `docs/tasks/023-capture-fe-contract.md`: `GET /sheets/:id/columns`
tidak mengekspos definisi formula, sehingga frontend tidak bisa membedakan kolom formula
dari kolom biasa. Tambahkan `formulaOp` (nullable) dan `formulaOperandIds` (array) ke
respons endpoint ini, di seluruh kedalaman pohon, secara aditif (tanpa mengubah field lama).

## Rencana Singkat
1. Perluas `ColumnNode` interface + `select` Prisma di `SheetsService.getColumns`
   (`src/sheets/sheets.service.ts`) dengan `formulaOp` dan `formulaOperandIds`.
2. Selaraskan contoh Swagger (`@ApiResponse` schema) di `SheetsController.findColumns`
   (`src/sheets/sheets.controller.ts`).
3. Verifikasi runtime: sheet dari task 023 (`023 FE Contract Test`) sudah punya kolom
   formula (`Total`, ADD) dan kolom biasa — pakai itu untuk buktikan bentuk baru tanpa
   perlu bikin fixture baru. Jalankan tes negatif standar (404/400/401).
4. Simpan satu response mentah ke `docs/responses/`.

## Catatan
`STATE.md` yang dirujuk task tidak ditemukan di repo manapun (sama seperti saat task 023) —
dilewati; tidak ada bagian tersebut untuk diperbarui.

## Di luar lingkup
Tidak mengubah perhitungan formula (`getRows`), tidak mengubah endpoint tulis
(`POST/PATCH /columns`), tidak menyentuh agregat.

## File Diubah
- `src/sheets/sheets.service.ts` — `ColumnNode` interface + `select`/mapping di `getColumns`
  ditambah `formulaOp` dan `formulaOperandIds` (aditif, field lama tidak berubah).
- `src/sheets/sheets.controller.ts` — contoh Swagger `GET /sheets/:id/columns` diselaraskan
  (menambahkan `formulaOp`/`formulaOperandIds` di tiap node contoh + satu node formula).
- `docs/tasks/024-columns-expose-formula.md` — task log ini.
- `docs/responses/024-columns-expose-formula.json` — bukti runtime (response mentah).

## Keputusan Kunci
- Field baru ditambahkan di level `select` Prisma dan langsung di konstruksi `ColumnNode`
  saat membangun map — bukan post-processing terpisah, supaya tidak ada query tambahan
  (anti-N+1 tetap terjaga, sesuai `docs/prompt-guardrails.md` bagian A).
- Tidak membuat fixture baru untuk verifikasi — memakai sheet `023 FE Contract Test`
  (task 023, punya kolom formula `Total`/ADD) dan sheet `DTPS` (punya kolom grup bertingkat
  `Kualifikasi Akademik > Magister/Doktor`) yang sudah ada, sehingga satu jalan verifikasi
  membuktikan baik ekspos formula maupun non-regresi pada pohon kolom bertingkat.
- `STATE.md` yang dirujuk task tidak ditemukan di repo (dicek ulang lewat pencarian
  rekursif) — dilewati, dicatat di atas.

## Hasil Verifikasi (bukti runtime, lihat `docs/responses/024-columns-expose-formula.json`)

| # | Skenario | Expected | Actual | Status |
|---|----------|----------|--------|--------|
| T1 | `GET /columns` sheet dengan kolom formula (Total, ADD) | `formulaOp:"ADD"`, `formulaOperandIds:[A,B]` | sama persis | ✅ |
| T2 | `GET /columns` kolom biasa (A, B, Kategori) | `formulaOp:null`, `formulaOperandIds:[]` | sama persis | ✅ |
| T3 | `GET /columns` sheet DTPS — kolom grup + anak bertingkat (regresi) | field lama (`id,name,type,orderIndex,children`) tak berubah + field baru muncul di semua level (termasuk anak grup) | sama persis, `Magister`/`Doktor` di dalam `children` juga punya `formulaOp:null, formulaOperandIds:[]` | ✅ |
| N1 | Sheet tidak ada | 404 | 404 — "Sheet tidak ditemukan" | ✅ |
| N2 | ID bukan UUID | 400 | 400 — "Validation failed (uuid is expected)" | ✅ |
| N3 | Tanpa token | 401 | 401 Unauthorized | ✅ |

Build (`pnpm run build` / `tsc -p tsconfig.build.json`) sukses tanpa error — tidak ada
konsumer lain `ColumnNode` yang rusak oleh field baru (dicek: hanya dipakai di
`sheets.service.ts` dan `sheets.controller.ts`).

## Belajar dari Sini
Menambah field ke interface + `select` di titik yang sama tempat node pohon dibangun
(bukan mapping terpisah setelahnya) membuat perubahan aditif ini nyaris tanpa risiko:
tidak ada query tambahan, tidak ada transformasi kedua yang bisa lupa menyertakan field
baru di level anak. Karena pohon dibangun dari list datar lewat `Map`, field baru otomatis
ikut di semua kedalaman — tidak perlu logika rekursif terpisah untuk "jangan lupa isi field
ini di children juga".

Memverifikasi dengan sheet yang *sudah ada* (023 untuk formula, DTPS untuk nested group)
alih-alih membuat fixture baru mempercepat verifikasi dan sekaligus membuktikan non-regresi
pada kasus yang lebih kompleks (kolom bertingkat) yang tidak ada di fixture formula itu sendiri.
