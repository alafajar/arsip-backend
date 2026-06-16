# 003b — Baca Struktur: Metadata Sheet (`GET /sheets/:id`)

## Tujuan
Membuat endpoint `GET /sheets/:id` yang mengembalikan metadata satu sheet berdasarkan ID-nya,
dilindungi JWT. Ini jembatan antara menu tree (3a) dan detail kolom/cell (3c/3d): frontend
dapat `sheetId` dari menu tree, lalu panggil endpoint ini untuk info sheet sebelum render tabel.

## Rencana Singkat
1. Perluas seed 3a: tambah 1 baris `sheets` contoh (DTPS), tautkan ke menu DTPS.
2. Buat `SheetsService.findById()` — satu query dengan `select` eksplisit.
3. Buat `SheetsController` — `GET /sheets/:id` dengan `ParseUUIDPipe`.
4. Update `MenusService.getTree()` agar tiap menu item menyertakan daftar `sheets`-nya.

## File Diubah

| File | Alasan |
|------|--------|
| `src/sheets/sheets.service.ts` | Baru — query sheet by id, NotFoundException jika tidak ada |
| `src/sheets/sheets.controller.ts` | Baru — handler `GET /sheets/:id` dengan ParseUUIDPipe |
| `src/sheets/sheets.module.ts` | Diperbarui — daftarkan service & controller |
| `src/menu/menus.service.ts` | Diperbarui — tambah `sheets` ke tiap node menu tree |
| `prisma/seed.ts` | Diperbarui — tambah 1 sheet contoh DTPS, tautkan ke menu DTPS |

## Keputusan Kunci

1. **`ParseUUIDPipe` langsung di parameter** — validasi terjadi sebelum handler dipanggil.
   Input bukan UUID → NestJS lempar `400 Bad Request` otomatis, query DB tidak pernah dijalankan.

2. **`NotFoundException` eksplisit, bukan biarkan null** — `findUnique` mengembalikan `null`
   kalau tidak ketemu, bukan melempar error. Kalau null dibiarkan return, frontend terima `200`
   dengan body `null` — membingungkan. Kita cek hasilnya dan lempar `NotFoundException` agar
   frontend terima `404` yang jelas.

3. **Satu query dengan `select` eksplisit** — field `createdAt`, `updatedAt`, `sourceImportId`
   tidak dikirim ke frontend karena tidak dibutuhkan di tahap ini. `menuItem` ikut diambil
   dalam query yang sama (`include` di-scope melalui `select`) — tidak ada query kedua terpisah.

4. **Update `GET /menus` agar menyertakan `sheets`** — alur frontend: ambil menu tree → baca
   `sheets[]` di tiap node → ambil `sheetId` → panggil `GET /sheets/:id`. Tanpa `sheets` di
   menu tree, frontend tidak tahu harus panggil `sheetId` berapa.

## Cara Verifikasi

```bash
# 1. Jalankan seed
pnpm ts-node prisma/seed.ts

# 2. Login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

SHEET_ID="00000000-0000-0000-0002-000000000001"

# 3. 200 — sheet ditemukan
curl -s "http://localhost:3000/sheets/$SHEET_ID" -H "Authorization: Bearer $TOKEN"

# 4. 404 — UUID valid tapi tidak ada di DB
curl -s "http://localhost:3000/sheets/00000000-0000-0000-0099-000000000099" \
  -H "Authorization: Bearer $TOKEN"

# 5. 400 — input bukan UUID
curl -s "http://localhost:3000/sheets/bukan-uuid" -H "Authorization: Bearer $TOKEN"

# 6. 401 — tanpa token
curl -s "http://localhost:3000/sheets/$SHEET_ID"

# 7. Buktikan alur menu→sheet: DTPS kini punya sheets[]
curl -s "http://localhost:3000/menus" -H "Authorization: Bearer $TOKEN"
```

## Belajar dari Sini

### Posisi slice ini di alur baca

```
GET /menus          (3a) → daftar menu tree + sheets[] per node
GET /sheets/:id     (3b) → metadata satu sheet ← kita di sini
GET /sheets/:id/... (3c) → kolom-kolom sheet
GET /sheets/:id/... (3d) → isi cell (data tabel)
```

Frontend mengikuti alur ini secara berurutan: dari menu tree, ambil `sheetId`,
panggil endpoint sheet untuk konfirmasi metadata, lalu lanjut ke kolom dan cell.

### `ParseUUIDPipe` sebagai penjaga keamanan kecil

`@Param('id', ParseUUIDPipe)` membuat NestJS memvalidasi format UUID sebelum handler
berjalan. Tanpanya, string seperti `'; DROP TABLE sheets; --` bisa lolos masuk ke query
(walau Prisma sudah memakai parameterized query, lebih baik blokir sedini mungkin).
Hasilnya: input sampah → `400`, bukan `500` dari DB yang bingung.

### Beda 404 vs 500 — kenapa penting

| Kode | Artinya | Apa yang terjadi |
|------|---------|-----------------|
| 404  | "Tidak ada" | Kita cek hasilnya, `null` → lempar `NotFoundException` |
| 500  | "Ada yang rusak" | Bug atau exception tak tertangani, stack trace bocor |

Kalau kita biarkan `null` dikembalikan langsung sebagai body, frontend terima `200 null`
dan bingung. Kalau ada error tak tertangani, `500` bisa bocorkan informasi internal
(stack trace, nama file, struktur DB). `404` yang eksplisit lebih aman dan lebih jelas.

### Apa itu N+1 dan kenapa kita pakai satu query

N+1 adalah pola buruk di mana kode membuat 1 query untuk daftar, lalu N query tambahan
(satu per item) untuk data relasinya:

```ts
// BAD — N+1
const sheet = await prisma.sheet.findUnique({ where: { id } });
const menuItem = await prisma.menuItem.findUnique({ where: { id: sheet.menuItemId } }); // query ke-2!
```

```ts
// GOOD — 1 query
const sheet = await prisma.sheet.findUnique({
  where: { id },
  select: { ..., menuItem: { select: { id: true, name: true } } },
});
```

Di slice ini hanya 1 sheet, jadi N+1 belum terasa. Tapi di slice 3d (cell), ada banyak
baris × kolom — N+1 di sana bisa membuat response lambat puluhan kali. Disiplin pakai
`include`/`select` dalam satu query ditanamkan sekarang agar tidak perlu refactor nanti.

### Catatan: data ini sementara

Sheet seed `DTPS` adalah contoh untuk verifikasi. Di produksi, sheet dibuat otomatis
dari hasil import Excel (blok import) atau manual via UI (Sprint 2).
