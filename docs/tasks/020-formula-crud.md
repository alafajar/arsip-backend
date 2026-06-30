# 020 — CRUD definisi kolom formula + validasi

## Tujuan
Admin membuat/ubah kolom formula lewat API dengan validasi penuh: operand ada di sheet,
tipe numerik (kecuali COUNT), tidak self-reference, tidak siklus.

## Keputusan desain
Perluas endpoint kolom yang sudah ada (task 010) — bukan endpoint baru.
- `POST /sheets/:id/columns` sudah mendukung formulaOp+formulaOperandIds (task 012).
  Sekarang tambah validasi ke service.
- `PATCH /columns/:id` diperluas dengan formulaOp+formulaOperandIds di UpdateColumnDto.

## Rencana singkat
1. Tambah `validateFormulaDefinition(sheetId, selfId|null, op, operandIds)` di ColumnsService.
2. Panggil dari `createColumn` (selfId=null) dan `updateColumn` (selfId=columnId).
3. Perluas `UpdateColumnDto` dengan `formulaOp?` dan `formulaOperandIds?`.
4. Update `updateColumn` untuk menyimpan formula fields + re-validate bila diubah.

## Validasi yang diimplementasi
- `formulaOperandIds` tidak kosong (≥ 1)
- SUB/DIV: ≥ 2 operand
- Setiap operandId ada dan milik sheet (tidak ada query per-operand; satu fetch semua kolom)
- Tipe numerik (kecuali COUNT): operand harus INTEGER atau FLOAT
- Self-reference: operandId === selfColumnId → 400
- Siklus: DFS dari operandIds → bila sampai di selfColumnId → 400

## Cycle detection
DFS iteratif dari setiap operandId, menelusuri graph formulaOperandIds kolom formula
yang sudah ada. Bila visited[selfColumnId] → siklus. Kompleksitas O(V+E) per validasi.

## File diubah
- `src/columns/dto/update-column.dto.ts`
- `src/columns/columns.service.ts`

## Hasil tes

| # | Skenario | Expected | Actual | Status |
|---|----------|----------|--------|--------|
| T1 | POST kolom SUM(INTEGER, FLOAT) | 201 + formulaOp=SUM | 201 + id | ✅ |
| T2 | POST kolom COUNT(INTEGER, TEXT) — COUNT bebas tipe | 201 + formulaOp=COUNT | 201 + id | ✅ |
| N1 | SUM dengan operand TEXT | 400 | 400 — "Operand 'Teks' bertipe TEXT..." | ✅ |
| N2 | Operand tidak ada di sheet | 400 | 400 — "operandId '...' tidak ditemukan" | ✅ |
| N3 | formulaOp tanpa formulaOperandIds (array kosong) | 400 | 400 — "tidak boleh kosong" | ✅ |
| N4 | SUB dengan 1 operand | 400 | 400 — "minimal 2 operand" | ✅ |
| N5 | DIV dengan 1 operand | 400 | 400 — "minimal 2 operand" | ✅ |
| N6 | Tanpa token | 401 | 401 Unauthorized | ✅ |
| N7 | Kaprodi (non-admin) | 403 | 403 Forbidden | ✅ |
| N8 | PATCH cSum → mengacu dirinya sendiri | 400 | 400 — "self-reference" | ✅ |
| N9 | PATCH B→SUM(A) di mana A→SUM(B) | 400 | 400 — "Terdeteksi siklus..." | ✅ |
| N10 | PATCH valid: ubah nama+formulaOp | 200 | 200 + name/formulaOp baru | ✅ |
| N11 | POST kolom di sheet isReadOnly | 409 | 409 — "hanya-baca dan tidak bisa diubah" | ✅ |

## Belajar dari sini

**Validasi bertingkat dengan satu query DB**
Semua validasi formula (ada di sheet, tipe kolom, deteksi siklus) dilakukan dalam satu
`findMany({ where: { sheetId } })`. Ini menghindari N round-trip DB per operand.
Biaya: sedikit memori untuk sheet besar. Trade-off ini wajar untuk Sprint 2.

**DFS iteratif untuk deteksi siklus**
Algoritma DFS pakai stack array + set visited — O(V+E). Tumpukan tidak akan habis memori
(tidak rekursif). Mengapa hanya saat UPDATE bukan CREATE? Saat CREATE, kolom belum punya ID,
sehingga tidak mungkin ada siklus yang melewati kolom tersebut.

**COUNT dikecualikan dari pemeriksaan tipe numerik**
COUNT menghitung *entri valid* (bukan menjumlahkan nilainya), sehingga operand TEXT tetap
bermakna ("berapa sel ini tidak kosong?"). Semua operasi lain (ADD, SUB, MUL, DIV, SUM,
AVERAGE, MAX, MIN) memerlukan angka → kolom harus INTEGER atau FLOAT.

**Self-reference guard hanya saat UPDATE**
`selfColumnId` diisi hanya saat UPDATE karena saat CREATE, ID kolom belum ada di DB →
tidak mungkin operandId sama dengan kolom yang sedang dibuat.

**Pesan error yang actionable**
Pesan error menyebut nama kolom dan tipe-nya: `"Operand 'Teks' bertipe TEXT — operasi SUM
hanya mendukung kolom INTEGER atau FLOAT"`. Frontend bisa menampilkan pesan ini langsung
ke user tanpa terjemahan tambahan.
