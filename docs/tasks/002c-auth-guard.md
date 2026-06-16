# 002c — Auth Guard Global (JWT, default terkunci)

## Tujuan
Pasang JWT auth guard sebagai APP_GUARD global sehingga semua route terlindungi secara
default. Route yang boleh diakses tanpa login ditandai `@Public()`. Ini lapisan
autentikasi saja — pengecekan role ada di 2d.

## Rencana Singkat
1. Buat `JwtStrategy` — verifikasi access token, cek user ke DB.
2. Buat decorator `@Public()`.
3. Buat `JwtAuthGuard` — global, hormati `@Public()`.
4. Daftarkan sebagai APP_GUARD di AuthModule.
5. Tandai `POST /auth/login` dan `GET /health` sebagai `@Public()`.
6. Tambah `GET /auth/me` untuk verifikasi.

## File Diubah

| File | Alasan |
|------|--------|
| `src/auth/strategies/jwt.strategy.ts` | Verifikasi access token; cek user ke DB setiap request |
| `src/auth/decorators/public.decorator.ts` | Decorator `@Public()` untuk opt-out dari guard |
| `src/auth/guards/jwt-auth.guard.ts` | Guard global; bypass jika `@Public()`, sinon cek JWT |
| `src/auth/auth.module.ts` | Import PassportModule; daftarkan JwtStrategy + APP_GUARD |
| `src/auth/auth.controller.ts` | Tambah `@Public()` pada login; tambah `GET /auth/me` |
| `src/health/health.controller.ts` | Tambah `@Public()` agar health check tetap terbuka |

## Keputusan Kunci

1. **`APP_GUARD` di AuthModule, bukan AppModule** — Guard global bisa didaftarkan di modul
   mana pun. Meletakkannya di `AuthModule` lebih kohesif karena semua auth concern berada
   di tempat yang sama.

2. **Strategy cek DB tiap request** — `JwtStrategy.validate()` selalu query DB untuk
   memastikan user masih ada dan `isActive: true`. Ini sedikit lebih lambat, tapi
   memastikan user yang dinonaktifkan setelah token terbit langsung ditolak — tanpa menunggu
   token kadaluwarsa. Pilihan ini tepat untuk sistem yang butuh kontrol akses ketat.

3. **`getAllAndOverride` bukan `get`** — Reflector dipakai dengan `getAllAndOverride` agar
   decorator `@Public()` bisa diletakkan di level class ATAU method — mana pun yang ditemukan
   pertama akan dipakai.

4. **`GET /auth/me` dipertahankan** — Endpoint ini berguna untuk frontend: setelah login,
   frontend bisa memanggil `/auth/me` untuk mengetahui siapa user yang sedang aktif (id,
   username, role) tanpa perlu menyimpan data itu secara manual di client.

## Belajar dari Sini

### Beda autentikasi (2c) vs otorisasi (2d)
**Autentikasi** menjawab: "Siapa kamu?" — memastikan token valid dan user dikenal.
Hasilnya: `request.user` berisi identitas terverifikasi.

**Otorisasi** menjawab: "Boleh apa kamu?" — membaca `request.user.role` dan memutuskan
apakah role tersebut punya akses ke resource yang diminta. Ini dikerjakan di 2d (role guard),
yang akan *membaca hasil kerja 2c* dari `request.user`.

### Kenapa guard global + default terkunci lebih aman?
Alternatifnya adalah menempel guard satu per satu di setiap controller/handler.
Masalahnya: developer yang lupa menempelkan guard akan meninggalkan route terbuka tanpa
sadar — dan route yang terlalu terbuka bisa tidak ketahuan lama.

Dengan default terkunci, kalau developer lupa menandai route yang memang harus terbuka
dengan `@Public()`, efeknya kebalikan: route terlalu ketat dan langsung ketahuan (401 saat
dicoba). Kesalahan yang cepat terdeteksi lebih aman daripada celah yang diam-diam terbuka.

### Kenapa strategy cek DB, tidak sepenuhnya percaya isi token?
JWT berisi klaim yang ditandatangani pada saat token diterbitkan. Kalau user dinonaktifkan
10 menit setelah login, token lamanya masih valid hingga kadaluwarsa (15 menit) — kecuali
server aktif memeriksa status terkini ke DB. Dengan cek DB di setiap request, `isActive:
false` langsung berlaku — tidak perlu menunggu token kadaluwarsa.

### Peran `request.user` untuk lapisan berikutnya
Setelah `JwtStrategy.validate()` mengembalikan objek user, NestJS otomatis menempel objek itu
ke `request.user`. Ini menjadi "identitas terpercaya" yang sudah terverifikasi. Role guard
(2d) akan membaca `request.user.role` untuk memutuskan boleh/tidak — tanpa perlu query DB
lagi, karena autentikasi sudah menjaminnya.
