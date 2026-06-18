# 003f — Edit Baris: `PATCH /sheets/:id/rows/:rowId`

## Tujuan
Mengimplementasikan endpoint untuk mengubah nilai sel pada baris yang sudah ada.
Pola guardrail C identik dengan 3e (validasi, transaksi, audit) — perbedaan utama
adalah semantik "kosongkan = hapus Cell" dan penggunaan `upsert` bukan `create`.

## Rencana singkat
1. Buat `src/sheets/dto/update-row.dto.ts` — bentuk body sama dengan 3e.
2. Tambah `updateRow` ke `SheetsService` — validasi berlapis + transaksi upsert/delete.
3. Tambah `PATCH :id/rows/:rowId` ke `SheetsController` — `@Roles(Role.ADMIN)`.

## File diubah

| File | Alasan |
|---|---|
| `src/sheets/dto/update-row.dto.ts` | **Dibuat baru** — DTO edit (bentuk sama dengan create) |
| `src/sheets/sheets.service.ts` | Tambah `updateRow` + import `UpdateRowDto` |
| `src/sheets/sheets.controller.ts` | Tambah route `PATCH :id/rows/:rowId` + import `Patch`, `UpdateRowDto` |

## Keputusan kunci

- `validateValueForType` dari 3e **dipakai ulang** tanpa modifikasi. Nilai kosong (null /
  "" / whitespace) **tidak** dilewatkan ke validator karena itu bukan nilai — itu perintah
  hapus.
- Respons dibangun dengan **re-fetch cell** setelah transaksi (satu query tambahan)
  daripada merekonstruksi dari input DTO. Ini lebih akurat dan konsisten dengan 3d: sel
  yang tidak disentuh payload tetap menampilkan nilai aslinya.
- Konkurensi: last-write-wins. Dua admin mengedit baris yang sama → editor terakhir yang
  menang. Optimistic locking (`updatedAt` check) ditunda ke Sprint 2.

## Belajar dari sini

### Semantik "kosongkan = hapus Cell" — kenapa bukan menyimpan `""`?
Model data ini memakai **EAV (Entity–Attribute–Value)**: tiap sel adalah satu baris
di tabel `cells`. "Tidak ada nilai" = tidak ada baris Cell. Slice 3d (baca) memetakan
Cell yang tidak ada → `null` di respons. Kalau kita menyimpan `""` (string kosong),
3d akan mengembalikan `""` untuk sel yang "dikosongkan" — tapi untuk sel yang **belum
pernah diisi**, tetap `null`. Dua kondisi yang secara semantik sama ("kosong") lalu
memiliki representasi berbeda di UI. Menyimpan `""` merusak konsistensi ini. Solusi:
kosongkan = `deleteMany` cell — representasi kembali ke "tidak ada baris" = `null`.

### Upsert vs insert (beda dengan 3e)
3e (create): semua cell adalah **insert baru** — baris baru → cell baru.
3f (edit): cell mungkin **sudah ada atau belum**:
- Sudah ada → `update` nilai.
- Belum ada → `create` cell baru.
- Prisma menggabungkan dua kemungkinan ini dalam satu operasi: `upsert` (update-or-
  insert), dengan `where: { rowId_columnId: { rowId, columnId } }` sebagai kunci unik.

### Kenapa cek "row milik sheet ini"?
Bayangkan URL: `PATCH /sheets/SHEET-A/rows/ROW-dari-SHEET-B`. Jika hanya memeriksa
"apakah ROW-dari-SHEET-B ada?" maka jawabannya ya — row itu ada, hanya bukan milik
SHEET-A. Tanpa cek `row.sheetId === sheetId`, admin bisa mengedit baris dari sheet
lain hanya dengan memanipulasi URL. Cek ini adalah penjaga **kepemilikan resource**:
route params harus konsisten satu sama lain.

### Transaksi + audit tetap wajib untuk operasi edit
Edit bisa menyentuh banyak sel sekaligus. Jika sel ke-3 gagal (mis. constraint
database), sel ke-1 dan ke-2 sudah terubah — data tidak konsisten. Transaksi menjamin
semua-atau-tidak. Audit (`ChangeLog` dengan `action: UPDATE`) mencatat siapa yang
mengubah baris ini dan kolom mana saja yang disentuh — penting untuk riwayat versi
(Sprint 2).

## Posisi di alur

```
create baris (3e) → edit baris (3f) ← kita di sini → hapus baris (3g) → import (T5)
```

## Cara verifikasi

```bash
SHEET="00000000-0000-0000-0002-000000000001"
ROW1="00000000-0000-0000-0004-000000000001"
ADMIN_TOKEN=<dari POST /auth/login>

# 1. Ubah Jabatan → 200, nilai berubah
PATCH /sheets/$SHEET/rows/$ROW1 {"cells":[{"columnId":"<col-jabatan>","value":"Lektor Kepala"}]}

# 2. NIDN nol di depan utuh
{"cells":[{"columnId":"<col-nidn>","value":"0011087010"}]}

# 3. Kosongkan sel (value="") → GET /rows menampilkan null untuk kolom itu

# 4. Isi sel yang kosong → cell baru muncul

# 5. KAPRODI → 403; tanpa token → 401

# 6. INTEGER salah + rollback: kirim batch berisi value "abc" untuk INTEGER
#    → HTTP 400; bandingkan nilai sebelum/sesudah via GET /rows → tidak berubah

# 7. rowId milik sheet lain → 404; rowId acak → 404; bukan UUID → 400

# 8. Node grup sebagai columnId → 400
```
