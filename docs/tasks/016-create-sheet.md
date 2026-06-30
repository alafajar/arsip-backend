# 016 — Buat tabel kosong (POST /sheets)

## Tujuan
Admin membuat sheet kosong baru di bawah sebuah menu item sebagai fondasi fitur "buat tabel manual".

## Rencana singkat
1. Tambah `CreateSheetDto` (`menuItemId: UUID`, `name: non-empty string`).
2. Tambah `createSheet(dto, userId)` di `SheetsService`:
   - Cek `menuItemId` ada → 404 jika tidak.
   - `orderIndex` = max(orderIndex sheets di menu itu) + 1, atau 1 jika belum ada.
   - Buat `Sheet` (isReadOnly=false, sourceImportId=null) + `ChangeLog` dalam transaksi.
   - Kembalikan field: id, name, menuItemId, isReadOnly, orderIndex.
3. Tambah `POST /sheets` di `SheetsController` dengan `@Roles(Role.ADMIN)`.

## File diubah
- `src/sheets/dto/create-sheet.dto.ts` — DTO baru (file baru)
- `src/sheets/sheets.service.ts` — tambah `createSheet`
- `src/sheets/sheets.controller.ts` — tambah POST /sheets

## Keputusan kunci
- `orderIndex` = max+1 antar sheet dalam menu yang sama: konsisten dengan perilaku `createRow`.
- Transaksi: sheet + changeLog atomik.
- `isReadOnly` selalu false untuk sheet manual (hanya import yang boleh true).

## Hasil tes

| # | Request | Expected | Actual | Status |
|---|---------|----------|--------|--------|
| T1 | POST /sheets valid | 201 + id, name, menuItemId, isReadOnly=false, orderIndex=1 | sama | ✅ |
| T2 | POST /sheets kedua ke menu sama | orderIndex=2 | orderIndex=2 | ✅ |
| N1 | menuItemId tidak ada | 404 `Menu item tidak ditemukan` | sama | ✅ |
| N2 | Kaprodi POST /sheets | 403 | 403 | ✅ |
| N3 | Tanpa token | 401 | 401 | ✅ |
| N4 | name="" | 400 `name tidak boleh kosong` | sama | ✅ |
| N5 | Body kosong `{}` | 400 | 400 | ✅ |

## Belajar dari sini

**orderIndex = max+1 per menu**
`orderIndex` dihitung dari sheet di menu yang sama (`menuItemId`), bukan global.
Pola yang sama dipakai `createRow` — ambil max+1 dalam transaksi agar tidak ada race condition
bila dua admin menambah sheet simultan.

**Transaksi atomik sheet + ChangeLog**
Sheet baru dan entri ChangeLog dibuat dalam satu `$transaction`.
Bila ChangeLog gagal (misal userId tidak valid), sheet tidak tersimpan — tidak ada "orphan sheet"
tanpa audit trail.

**DTO: `@Matches(UUID_RE)` bukan `@IsUUID()`**
`@IsUUID()` menolak sentinel UUID `00000000-0000-0000-0001-000000000002` (byte variant 0x00,
bukan RFC 4122). Regex permisif `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i` digunakan konsisten
di seluruh proyek untuk menghindari masalah ini.
