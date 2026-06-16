# 002f — Rate Limiting (Anti Brute-Force, In-Memory)

## Tujuan
Menutup utang keamanan dari 2c: lindungi endpoint sensitif (login, refresh) dari
brute-force dengan rate limiting in-memory. Throttler berjalan paling awal sebagai
APP_GUARD pertama, sebelum JWT dan roles guard.

## Rencana Singkat
1. Install `@nestjs/throttler`.
2. Daftarkan `ThrottlerModule` (global default) di `AppModule` via env config.
3. Daftarkan `ThrottlerGuard` sebagai APP_GUARD PERTAMA di `AuthModule`.
4. Override batas ketat pada `POST /auth/login` (5/60s) dan `POST /auth/refresh` (10/60s).
5. Aktifkan trust proxy via env; tambahkan exception filter pesan 429 yang generik.

## File Diubah

| File | Alasan |
|------|--------|
| `src/app.module.ts` | Import `ThrottlerModule.forRootAsync` dengan config dari env |
| `src/auth/auth.module.ts` | Daftarkan `ThrottlerGuard` sebagai APP_GUARD pertama |
| `src/auth/auth.controller.ts` | Import `@Throttle`; override batas login (5) & refresh (10) |
| `src/auth/filters/throttler-exception.filter.ts` | Custom filter: pesan 429 generik |
| `src/main.ts` | Aktifkan filter global + trust proxy configurable |
| `.env` | Tambah 5 env: `THROTTLE_*`, `TRUST_PROXY` |
| `.env.example` | Tambah placeholder + komentar |

## Keputusan Kunci

1. **Urutan APP_GUARD: throttler → JWT → roles** — APP_GUARD dieksekusi sesuai urutan
   registrasi di `providers`. ThrottlerGuard didaftarkan pertama agar request yang
   melampaui batas langsung ditolak (429) tanpa menyentuh logika JWT atau DB. Ini
   menghemat resource sekaligus memutus serangan sebelum masuk ke layer autentikasi.

2. **Override `@Throttle` per-handler bukan per-controller** — Batas ketat (5/60s) hanya
   pada `login` dan `refresh`. Handler lain di `AuthController` tetap pakai global default
   (100/60s). Ini lebih fleksibel daripada mendaftarkan throttler terpisah per-controller.

3. **Nilai dari env, bukan hardcode** — `THROTTLE_LOGIN_LIMIT`, `THROTTLE_REFRESH_LIMIT`,
   dst. bisa diubah tanpa deploy ulang. Di production bisa diperketat tanpa sentuh kode.
   Nilai `@Throttle` dibaca dari `process.env` saat modul di-load (bukan via ConfigService
   karena decorator dieksekusi sebelum DI container siap).

4. **Trust proxy dikonfigurasi via `TRUST_PROXY` env** — `false` di dev (tanpa proxy),
   `1` di production di belakang Nginx/Cloudflare. Ini WAJIB diverifikasi saat infra siap
   karena salah konfigurasi membuat rate limit tidak berguna (lihat bawah).

5. **Pesan 429 generik via exception filter** — Default pesan throttler (`ThrottlerException`)
   tidak mengandung info username, tapi kita override agar konsisten dengan pesan generik
   sistem: "Terlalu banyak percobaan, coba lagi nanti." — tidak membocorkan apakah
   username terdaftar atau tidak.

## Checklist Pra-Produksi (Utang Keamanan Tersisa)

Dari seluruh blok auth (2a–2f), yang masih perlu diverifikasi sebelum production:

- [ ] **Cookie `SameSite`/`Secure`** — set `COOKIE_SECURE=true` dan `COOKIE_SAME_SITE=lax`
  (atau `none` jika beda domain, wajib HTTPS). (dari 2e)
- [ ] **Proteksi CSRF penuh** — jika `SameSite=None` (beda domain), tambahkan double-submit
  CSRF token. Saat ini hanya mengandalkan `SameSite`. (dari 2e)
- [ ] **Trust proxy benar** — set `TRUST_PROXY=1` di belakang Nginx/Cloudflare.
  Verifikasi IP nyata terbaca dengan benar. (dari 2f)
- [ ] **Pindah rate-limit ke Redis** — jika multi-server atau restart harus mempertahankan
  counter. Ganti `ThrottlerStorageRedis` di `ThrottlerModule`. (dari 2f)

## Belajar dari Sini

### Kenapa login adalah target brute-force utama?
Login adalah satu-satunya endpoint yang menerima kredensial terbuka. Penyerang bisa
mencoba ribuan kombinasi username+password secara otomatis (brute-force/credential stuffing)
tanpa rate limit. Batas 5 percobaan/60s membuat serangan jadi tidak praktis: 5 percobaan
lalu tunggu 60 detik → maksimum 7.200 percobaan per hari per IP — dibandingkan jutaan
tanpa limit.

### Kenapa rate limit in-memory cukup untuk 1 server?
In-memory berarti counter hanya ada di RAM proses yang berjalan. Satu server cukup karena:
- Counter tidak hilang selama server jalan
- Tidak ada overhead network ke Redis
- Cukup untuk dev dan deployment skala kecil

Kapan harus pindah ke Redis:
- **Multi-server**: counter terpisah per server → penyerang bisa round-robin antar server
  dan menghindari limit di masing-masing
- **Restart**: counter di-reset → window bersih bagi penyerang setiap deploy
- Redis menyimpan counter terpusat, persistent (opsional), dan shared antar instance

### Kenapa trust proxy krusial di belakang reverse proxy?
Tanpa `trust proxy`, Express membaca IP dari socket koneksi langsung. Di belakang proxy,
socket selalu dari IP proxy (mis. `127.0.0.1` atau IP internal load balancer) — bukan IP
asli user. Akibatnya:
- Semua user terlihat dari satu IP → rate limit memblokir semua user sekaligus, atau
- Proxy diblokir → seluruh traffic mati

Dengan `trust proxy = 1`, Express membaca header `X-Forwarded-For` yang diisi proxy
dengan IP asli client. WAJIB diverifikasi bahwa header ini memang diisi dan tidak
bisa di-spoof oleh client (Nginx/Cloudflare sudah menangani ini secara default).

### 429 vs 401 vs 403 — tiga kegagalan berbeda yang kini dikenali sistem

| Kode | Artinya | Kapan muncul |
|------|---------|--------------|
| **429** | Terlalu sering (rate limit) | Sebelum autentikasi; blokir dini |
| **401** | Tidak terautentikasi | Token tidak ada/invalid/expired |
| **403** | Terautentikasi tapi tidak berhak | Role tidak cukup |

Frontend bisa memberi respons berbeda: 429 → "coba lagi nanti", 401 → redirect login,
403 → tampilkan pesan "akses ditolak" tanpa redirect.
