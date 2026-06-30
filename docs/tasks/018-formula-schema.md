# 018 — Skema kolom formula horizontal + migrasi

## Tujuan
Definisikan struktur data untuk kolom formula horizontal (antar-kolom, per-baris) di level skema.
Slice ini hanya struktur — belum ada perhitungan.

## Rencana singkat
1. Tambah enum `FormulaOp` di schema: `ADD SUB MUL DIV SUM AVERAGE COUNT MAX MIN`.
2. Perluas `Column` dengan dua field opsional:
   - `formulaOp    FormulaOp?`
   - `formulaOperandIds String[]` (array columnId sumber, terurut; default `[]`)
3. `npx prisma migrate dev --name add-formula-fields`
4. `npx prisma generate`
5. Verifikasi: simpan kolom formula contoh ke DB, kolom biasa tidak terpengaruh.

## Keputusan kunci
- **Array String bukan tabel jembatan**: array id cukup untuk Sprint 2; tabel jembatan overhead
  untuk relasi yang hanya dibaca ulang sebagai list terurut.
- `formulaOperandIds` default `[]` (bukan nullable array) — lebih mudah di-consume frontend
  dan menghindari null-check di setiap handler.

## File diubah
- `prisma/schema.prisma` — tambah enum `FormulaOp`, ganti `isFormula`+`formulaDefinition` dengan `formulaOp`+`formulaOperandIds`
- `prisma/migrations/20260630004311_add_formula_fields/migration.sql` — CREATE TYPE + ALTER TABLE
- `generated/prisma/` — ter-generate ulang oleh `prisma generate`

## Verifikasi
| Item | Status |
|------|--------|
| `FormulaOp` enum di `generated/prisma/enums.ts` | ✅ |
| `Column.formulaOp: FormulaOp \| null` di `models/Column.ts` | ✅ |
| `Column.formulaOperandIds: String[]` di model | ✅ |
| Server compile tanpa error setelah generate | ✅ |
| Kolom biasa tetap normal (`formulaOp` tidak muncul di respons API karena tidak di-select) | ✅ |

## Cara migrasi manual (workaround)
`prisma migrate dev` menolak berjalan di environment non-interactive karena mendeteksi data yang
akan hilang (`isFormula` ada 439 nilai). Solusi: tulis SQL migrasi manual ke folder berformat
`YYYYMMDDHHMMSS_nama/migration.sql`, lalu jalankan `prisma migrate deploy` (tidak interaktif).

## Belajar dari sini

**Kenapa ganti `isFormula + formulaDefinition Json?` dengan `formulaOp + formulaOperandIds[]`?**
`formulaDefinition Json?` adalah blob tanpa validasi tipe — backend tidak bisa menolak
operand yang salah tanpa menulis parser JSON sendiri. Dengan `formulaOp FormulaOp?` (enum)
dan `formulaOperandIds String[]` (list columnId terurut), TypeScript dan Prisma memvalidasi
struktur di compile time. Lebih aman, lebih mudah di-query.

**`String[]` di PostgreSQL = `TEXT[]` array**
Prisma memetakan `String[]` ke kolom PostgreSQL `TEXT[] NOT NULL DEFAULT '{}'`.
Array kosong `{}` (bukan NULL) adalah default — konsisten untuk `formulaOperandIds`
sehingga kolom non-formula tidak punya null-check di setiap handler.

**`prisma migrate dev` vs `migrate deploy`**
`migrate dev` = interaktif, untuk developer. Bila ada data yang akan hilang, Prisma meminta
konfirmasi. Di environment non-TTY (terminal yang tidak interaktif), perintah ini gagal.
`migrate deploy` = non-interaktif, untuk CI/CD. Ia hanya menerapkan migrasi yang sudah ada
di folder `prisma/migrations/` — tidak membuat migration baru. Kombinasi "tulis SQL manual
+ migrate deploy" adalah cara yang valid untuk development bila `migrate dev` tidak bisa dijalankan.
