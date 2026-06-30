# 011 — Endpoint breadcrumb (GET /menus/:id/path)

## Tujuan
Sediakan endpoint `GET /menus/:id/path` agar frontend bisa menampilkan breadcrumb
yang dapat diklik dari sebuah node menu hingga ke root.

## Rencana singkat
1. Tambah method `getPath(id)` di `MenusService`:
   - Satu query ambil semua `menu_items` (`id, name, parentId`).
   - Cek apakah `id` target ada — 404 bila tidak.
   - Telusuri rantai `parentId` di memori sampai ke root.
   - Balik urutan → kembalikan `{ id, name }[]` dari root ke target.
2. Tambah handler `GET :id/path` di `MenusController` (ParseUUIDPipe → 400 otomatis).
3. Tidak ada perubahan schema, tidak ada endpoint lain yang disentuh.

## File diubah
- `src/menu/menus.service.ts` — tambah method `getPath`
- `src/menu/menus.controller.ts` — tambah route `GET :id/path`
- `docs/tasks/011-breadcrumb.md` — file ini

## Keputusan kunci
- **Anti-N+1**: satu query `findMany` (select id/name/parentId), traversal di memori.
  Skala menu puluhan node — aman, tidak perlu CTE rekursif.
- **K1 terjaga**: tidak ada root node fisik, tidak ada migrasi reparent.
  Cukup sediakan endpoint jalur; struktur data DB tidak diubah.
- **Urutan**: root pertama, target terakhir — konvensi breadcrumb standar.

## Hasil tes

| # | Request | Expected | Actual | Status |
|---|---------|----------|--------|--------|
| T1 | GET /menus/PS_ID/path (depth 3) | `[Kurikulum, Final Lampiran, PS]` | `[Kurikulum, Final Lampiran, PS]` | ✅ |
| T2 | GET /menus/DTPS_ID/path (depth 2) | `[Kriteria, DTPS]` | `[Kriteria, DTPS]` | ✅ |
| T3 | GET /menus/KRITERIA_ID/path (top-level) | `[Kriteria]` (1 item) | `[{"id":...,"name":"Kriteria"}]` | ✅ |
| N1 | UUID valid, node tidak ada | 404 | 404 `Node tidak ditemukan` | ✅ |
| N2 | Bukan UUID (`bukan-uuid`) | 400 | 400 `Validation failed (uuid is expected)` | ✅ |
| N3 | Tanpa token | 401 | 401 | ✅ |

## Belajar dari sini

**Kenapa satu query, bukan query per ancestor?**
Pohon menu berukuran puluhan node. Mengambil semua `(id, name, parentId)` sekaligus
lalu menelusuri di memori adalah O(n) query + O(depth) traversal — jauh lebih efisien
dari N+1 query (satu query per level). Untuk skala ribuan node pun masih layak;
baru perlu CTE rekursif di SQL kalau pohon mencapai jutaan baris.

**Kenapa array dari root, bukan dari target?**
Konvensi breadcrumb standar: "Home > Kriteria > DTPS". Root di kiri, target di kanan.
Implementasi: kumpulkan dari target ke root (mudah karena hanya ikuti `parentId`),
lalu balik array di akhir (`path.reverse()`).

**TS7022 dan inferensi Map dari Prisma**
`new Map(all.map(n => [n.id, n]))` gagal kompilasi karena TypeScript tidak bisa
menyimpulkan `[string, PrismaType][]` dari tuple yang dibentuk oleh `.map()` —
ia menyimpulkan `(string | PrismaType)[][]` sehingga `Map.get()` bertipe `any`.
Solusi: deklarasikan tipe eksplisit `Map<string, Flat>` dan cast elemen via `as Flat`.
Ini bukan bug logika, hanya limitasi inferensi generik TypeScript dengan Prisma.
