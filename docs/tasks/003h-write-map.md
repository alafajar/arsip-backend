# 003h — Tulis Map: `POST /menus`, `PATCH /menus/:id`, `DELETE /menus/:id`

## Tujuan
Melengkapi DoD #2 ("admin membuat menu bertingkat") dengan sisi tulis node Map.
Sisi baca sudah ada (3a). Tiga endpoint baru: buat, ubah (rename/pindah), hapus node.

## Rencana singkat
1. Buat `src/menu/dto/create-menu.dto.ts` dan `update-menu.dto.ts`.
2. Tambah `create`, `update`, `delete`, dan `wouldCauseCycle` ke `MenusService`.
3. Tambah tiga route ke `MenusController`.

## File diubah

| File | Alasan |
|---|---|
| `src/menu/dto/create-menu.dto.ts` | **Baru** — validasi `name` wajib, `parentId` opsional UUID |
| `src/menu/dto/update-menu.dto.ts` | **Baru** — `name`/`parentId` keduanya opsional; `parentId: null` = pindah ke top-level |
| `src/menu/menus.service.ts` | Tambah `create`, `update`, `delete`, `wouldCauseCycle` |
| `src/menu/menus.controller.ts` | Tambah `POST`, `PATCH :id`, `DELETE :id` |

## Keputusan kunci

- `orderIndex` baru dihitung dalam transaksi: `max(orderIndex saudara) + 1`. Ini
  menjamin tidak ada race condition jika dua admin membuat node bersamaan.
- `parentId: null` pada `UpdateMenuDto` secara eksplisit memindahkan node ke top-level.
  `parentId: undefined` (tidak ada di body) berarti "tidak ubah posisi". Dibedakan dengan
  `@IsOptional()` yang melewatkan validasi `@Matches` untuk `null`.

## Belajar dari sini

### Kenapa siklus harus dicegah saat pindah node?
Pohon menu bekerja dengan pointer `parentId`. Jika node A adalah induk dari B, dan kita
pindah A ke B (`A.parentId = B`), maka:
- B.parent → A → B.parent → A → ... (lingkaran tak henti)

`GET /menus` membangun pohon dengan mengikuti relasi parent-child. Siklus menyebabkan
rekursi tak henti (stack overflow) atau infinite loop. Pendeteksian: sebelum mengubah
parentId, telusuri ke atas dari calon parent baru. Jika rute tersebut menyentuh node yang
sedang dipindah — ada siklus → tolak 400. Kompleksitas O(kedalaman pohon) — cukup cepat
untuk pohon menu yang kecil.

### Kenapa DELETE menolak node tak-kosong?
Node dengan anak atau sheet tertaut mewakili data yang lebih dalam: menghapus node A
berarti semua sheet di bawahnya (tabel data) ikut tidak bisa diakses, dan anak-anaknya
"terlepas" dari pohon. Ini hampir selalu kecelakaan, bukan niat. Di Sprint 1, hanya node
**kosong** (tanpa anak, tanpa sheet) yang boleh dihapus. Jika pengguna ingin hapus
seluruh subtree, ia harus menghapus dari bawah ke atas. Cascade delete subtree = keputusan
Sprint 2 (perlu konfirmasi UI dan soft delete dulu).

### Kenapa ini melengkapi DoD #2?
DoD #2: "Admin membuat menu bertingkat (Jurusan > LAMTEK)". Dengan 3a + 3h:
- `GET /menus` → baca pohon (sudah ada sejak 3a)
- `POST /menus` dengan `parentId` → buat anak node (baru, 3h)
- `PATCH /menus/:id` → rename atau pindah (baru, 3h)
- `DELETE /menus/:id` → hapus node kosong (baru, 3h)

Admin kini bisa membangun hierarki menu lewat API tanpa menyentuh DB secara manual.

## Cara verifikasi

```bash
ADMIN_TOKEN=<dari POST /auth/login>

# 1. Buat top-level → 201
POST /menus {"name":"Jurusan Informatika"}   → node baru tanpa parent

# 2. Buat anak → 201
POST /menus {"name":"LAMTEK","parentId":"<id-jurusan>"}

# 3. GET /menus → "Jurusan Informatika" punya anak "LAMTEK"

# 4. Rename → 200
PATCH /menus/<id-jurusan> {"name":"Jurusan Teknik Informatika"}

# 5. Siklus → 400
PATCH /menus/<id-jurusan> {"parentId":"<id-LAMTEK>"}  ← LAMTEK adalah anak Jurusan

# 6. DELETE node kosong → 200
# 7. DELETE node yang punya anak → 409

# 8. KAPRODI semua operasi → 403; tanpa token → 401
# 9. name kosong → 400; id acak → 404
```
