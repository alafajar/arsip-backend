# 3a — Baca Struktur: Menu Tree (`GET /menus`)

## Tujuan
Membuat endpoint `GET /menus` yang mengembalikan seluruh struktur menu sebagai pohon
bersarang (nested tree), dilindungi JWT. Ini slice pertama blok 3 karena read-only,
tidak bergantung ke sheet/data apapun, dan dibutuhkan frontend untuk membangun sidebar.

## Rencana Singkat
1. Buat `MenusService.getTree()` — ambil semua `menu_items` lalu bangun tree O(n) di memori.
2. Buat `MenusController` — satu handler `GET /menus`.
3. Daftarkan keduanya di `MenuModule`.
4. Tambahkan seed menu contoh (idempoten) ke `prisma/seed.ts`.

## File Diubah

| File | Alasan |
|------|--------|
| `src/menu/menus.service.ts` | Logika fetch + tree-building baru |
| `src/menu/menus.controller.ts` | Handler `GET /menus` baru |
| `src/menu/menu.module.ts` | Daftarkan service & controller |
| `prisma/seed.ts` | Tambah 4 menu_items contoh (idempoten via UUID hardcoded) |

## Keputusan Kunci

1. **Nama field sesuai schema asli** — prompt menyebut `label`/`order`/`sheetId` sebagai
   ilustrasi; schema asli pakai `name`, `orderIndex`, dan tidak ada `sheetId` di MenuItem
   (sheets ada di tabel terpisah). Kode mengikuti schema.

2. **Tree O(n) di memori, bukan recursive SQL** — untuk puluhan node menu, satu query
   flat + loop dua kali di aplikasi lebih mudah dibaca dan di-debug daripada CTE rekursif.
   Trade-off: seluruh tabel dimuat; tidak cocok untuk pohon ribuan node (bukan kasus kita).

3. **JwtAuthGuard tidak dideklarasikan ulang** — guard sudah terdaftar sebagai APP_GUARD
   global di `AuthModule`. Semua endpoint yang tidak `@Public()` otomatis terlindungi,
   termasuk `GET /menus`.

4. **UUID hardcoded untuk seed idempoten** — `name` tidak `@unique` di schema, jadi tidak
   bisa pakai `upsert({ where: { name } })`. Solusinya: pakai UUID tetap (`00000000-...`)
   yang tidak akan konflik dengan data produksi (UUID produksi di-generate random).

5. **Field respons minimal** — hanya `id`, `name`, `orderIndex`, `children`. Timestamp audit
   (`createdAt`, `updatedAt`) tidak dikirim ke frontend karena tidak dibutuhkan di menu sidebar.

## Cara Verifikasi

```bash
# 1. Jalankan seed
pnpm ts-node prisma/seed.ts

# 2. Cek baris masuk (opsional)
psql $DATABASE_URL -c "SELECT id, name, parent_id FROM menu_items ORDER BY order_index;"

# 3. Login untuk dapat token
curl -s -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq .accessToken

# 4. GET /menus dengan token
curl -s http://localhost:3000/menus \
  -H "Authorization: Bearer <token dari step 3>" | jq .

# 5. Ekspektasi: JSON pohon bersarang
# [
#   { "id":"...", "name":"Kriteria", "orderIndex":0, "children": [
#       { "id":"...", "name":"DTPS", "orderIndex":0, "children":[] },
#       { "id":"...", "name":"Profil Dosen", "orderIndex":1, "children":[] }
#   ]},
#   { "id":"...", "name":"Kurikulum", "orderIndex":1, "children":[] }
# ]

# 6. Tanpa token → harus 401
curl -s http://localhost:3000/menus | jq .statusCode

# 7. Jalankan seed kedua kali → jumlah baris tetap (tidak bertambah)
pnpm ts-node prisma/seed.ts
psql $DATABASE_URL -c "SELECT COUNT(*) FROM menu_items;"  -- harus tetap 4
```

## Belajar dari Sini

### Kenapa menu tree jadi slice pertama blok 3?

Blok 3 adalah endpoint bisnis. Menu tree dipilih pertama karena:
- **Read-only**: tidak ada CREATE/UPDATE/DELETE, risiko minim untuk belajar
- **Independen**: tidak bergantung ke sheet, kolom, atau data apapun
- **Langsung berguna**: frontend butuh ini untuk membangun sidebar navigasi

### Konsep baru: membangun tree dari list datar

Database relasional menyimpan data sebagai baris datar (flat). Untuk `menu_items`
yang self-referencing (tiap baris punya `parentId` yang merujuk ke baris lain di tabel
yang sama), ada dua cara menghasilkan pohon:

**Cara 1 — Recursive SQL (CTE)**: biarkan database melakukan rekursi
```sql
WITH RECURSIVE tree AS (
  SELECT * FROM menu_items WHERE parent_id IS NULL
  UNION ALL
  SELECT m.* FROM menu_items m JOIN tree t ON m.parent_id = t.id
)
SELECT * FROM tree;
```
Kuat untuk pohon dalam (ratusan level), tapi query lebih kompleks.

**Cara 2 — In-memory O(n)** (yang kita pakai):
1. Ambil semua baris sekaligus (1 query)
2. Buat `Map<id → node>` agar lookup parent O(1)
3. Iterasi sekali lagi: dorong tiap node ke `children` parent-nya
4. Kumpulkan node tanpa parent → itu root

Total: 2 pass × N node = O(n). Untuk menu puluhan node, ini lebih dari cukup.

### Kenapa seed perlu idempoten?

`prisma db seed` bisa dipanggil kapan saja: saat setup dev baru, saat reset DB, saat
CI. Kalau seed tidak idempoten (bisa dijalankan berulang tanpa efek samping), setiap
run menambah data duplikat. `upsert` menyelesaikan ini: INSERT jika belum ada, UPDATE
jika sudah ada — hasilnya sama di run ke-1 maupun ke-100.

### Catatan: data ini sementara

Seed menu di atas adalah data contoh untuk verifikasi. Di produksi, struktur menu akan
dibuat oleh admin lewat UI (Sprint 2), atau muncul otomatis dari hasil import Excel.
Seed ini akan dihapus atau digantikan saat fitur manajemen menu selesai.
