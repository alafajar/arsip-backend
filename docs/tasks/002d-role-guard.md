# 002d — Role Guard (Otorisasi: ADMIN vs KAPRODI)

## Tujuan
Tambah lapisan otorisasi berbasis role. 2c sudah menjamin "siapa kamu" (401 kalau gagal);
2d memutuskan "kamu boleh apa" (403 kalau role tidak cukup). Tidak ada endpoint bisnis
di prompt ini — cukup mekanisme guard + route uji.

## Rencana Singkat
1. Buat decorator `@Roles()` — import enum `Role` dari Prisma client yang di-generate.
2. Buat `RolesGuard` — baca metadata, bandingkan dengan `request.user.role`.
3. Daftarkan sebagai APP_GUARD kedua (setelah JwtAuthGuard) di AuthModule.
4. Tambah route uji `GET /auth/test-read` dan `POST /auth/test-write`.

## File Diubah

| File | Alasan |
|------|--------|
| `src/auth/decorators/roles.decorator.ts` | Decorator `@Roles()` + re-export enum `Role` |
| `src/auth/guards/roles.guard.ts` | Guard otorisasi: cek role vs metadata, lempar 403 |
| `src/auth/auth.module.ts` | Tambah RolesGuard sebagai APP_GUARD kedua |
| `src/auth/auth.controller.ts` | Tambah route uji test-read dan test-write |

## Keputusan Kunci

1. **Urutan APP_GUARD dijamin oleh urutan registrasi di `providers`** — Di NestJS,
   multiple APP_GUARD dieksekusi sesuai urutan kemunculannya di array `providers`.
   `JwtAuthGuard` didaftarkan lebih dulu → selalu berjalan lebih dulu → `request.user`
   sudah terisi saat `RolesGuard` berjalan. Ini cara paling eksplisit dan mudah dibaca.

2. **Enum `Role` dari `generated/prisma/enums`** — Import dari hasil generate Prisma
   (bukan dari `@prisma/client` seperti Prisma versi sebelumnya) karena Prisma 7
   menghasilkan client ke direktori custom (`generated/prisma`).

3. **`RolesGuard` re-export `Role`** — Decorator `roles.decorator.ts` me-re-export
   enum `Role` agar konsumer cukup import satu file (`roles.decorator`) untuk
   mendapat keduanya: decorator `@Roles()` dan enum `Role`.

4. **Route uji dipertahankan** — `GET /auth/test-read` dan `POST /auth/test-write`
   tetap ada sebagai smoke-test mekanisme guard. Endpoint bisnis nyata (sheet/cell)
   akan menggunakan `@Roles(Role.ADMIN)` dengan pola yang sama.

## Belajar dari Sini

### Autentikasi (2c) vs Otorisasi (2d) — lengkap

**Autentikasi** (2c): "Siapa kamu?" — verifikasi token JWT, cek user ke DB.
Gagal → **401 Unauthorized** (kamu tidak dikenal).

**Otorisasi** (2d): "Kamu boleh apa?" — cek apakah role user termasuk yang diizinkan.
Gagal → **403 Forbidden** (kamu dikenal, tapi tidak punya hak).

Beda 401 vs 403 ini penting untuk frontend: 401 = perlu login ulang; 403 = sudah login
tapi akses ditolak (tampilkan pesan "tidak diizinkan", bukan redirect ke login).

### Kenapa otorisasi WAJIB di server, bukan sekadar menyembunyikan tombol di frontend?
Frontend JavaScript bisa dimodifikasi oleh siapa saja di browser (DevTools, ekstensi, dll).
Menyembunyikan tombol "Hapus" untuk KAPRODI di UI tidak mencegah KAPRODI mengirim request
`DELETE /api/rows/123` secara langsung lewat Postman atau curl. Server adalah satu-satunya
tempat yang bisa diandalkan untuk menegakkan aturan — frontend hanya "kemudahan UI".

### Pola decorator + guard + reflector
NestJS menggunakan pola ini untuk melekatkan aturan secara deklaratif per-route:
1. **Decorator** (`@Roles(ADMIN)`) → menyimpan metadata pada handler/class.
2. **Guard** → `Reflector` membaca metadata itu saat request masuk, lalu memutuskan.
3. Hasilnya: aturan bisnis ("hanya ADMIN") tertulis tepat di sebelah route yang bersangkutan
   — mudah dibaca, mudah diaudit, tidak tersembunyi di tempat lain.

### Catatan untuk slice berikutnya
Mekanisme ini siap dipakai pada endpoint bisnis nyata. Contoh penggunaan di controller:
```ts
@Post()
@Roles(Role.ADMIN)          // hanya ADMIN bisa membuat
createRow(...) { ... }

@Get()                       // semua user login bisa membaca (tanpa @Roles)
getRows(...) { ... }
```
Tidak perlu kode tambahan — guard sudah global dan siap membaca decorator `@Roles` di mana pun.
