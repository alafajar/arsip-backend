# 002e — Refresh & Logout (Rotasi Token, Reuse Detection, httpOnly Cookie)

## Tujuan
Menutup siklus token: refresh token berpindah via httpOnly cookie, rotasi tiap pakai,
reuse detection untuk sinyal pencurian, dan logout yang meng-clear cookie + revoke token.

## Asumsi Domain
Frontend & backend **satu domain / reverse proxy** (dev: keduanya di localhost).
Konsekuensi: `SameSite=Lax` cukup, HTTPS tidak wajib saat dev.
Nilai cookie attribute configurable via env (`COOKIE_SECURE`, `COOKIE_SAME_SITE`).

Jika beda domain di production: set `COOKIE_SECURE=true` dan `COOKIE_SAME_SITE=none`
di env, WAJIB pakai HTTPS. Tanpa HTTPS, cookie `SameSite=None; Secure` tidak akan dikirim
browser (browser menolaknya secara diam-diam).

## Rencana Singkat
1. Install `cookie-parser`, aktifkan di `main.ts` + CORS with credentials.
2. Refactor `issueTokens`: terima `res` → set httpOnly cookie, kembalikan hanya `accessToken`.
3. Sesuaikan `login` controller agar passing `res`.
4. Buat `POST /auth/refresh`: verifikasi cookie → rotasi → reuse detection.
5. Buat `POST /auth/logout`: revoke baris aktif + clear cookie.

## File Diubah

| File | Alasan |
|------|--------|
| `src/main.ts` | Aktifkan `cookie-parser`; aktifkan CORS dengan `credentials: true` |
| `src/auth/auth.service.ts` | Refactor `issueTokens` (set cookie); tambah `refreshTokens`, `logout`, helper cookie |
| `src/auth/auth.controller.ts` | Tambah endpoint `POST /auth/refresh` dan `POST /auth/logout`; sesuaikan login |
| `.env` | Tambah `CORS_ORIGIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE` |
| `.env.example` | Tambah placeholder + komentar penjelasan nilai per environment |

## Keputusan Kunci

1. **Refresh token di httpOnly cookie, access token di body** — Cookie httpOnly tidak bisa
   dibaca JavaScript di browser (terlindung dari XSS). Access token disimpan di memori JS
   (bukan localStorage) karena umurnya pendek (15 menit) dan tidak perlu persist. Cookie
   path dibatasi `/auth` agar refresh_token hanya dikirim ke route `/auth/*`, tidak bocor
   ke setiap request API.

2. **Rotasi wajib tiap refresh** — Setelah token dipakai, langsung di-revoke dan pasangan
   baru diterbitkan. Token sekali pakai memastikan jendela penyalahgunaan seminimal mungkin.

3. **Reuse detection via `revokedAt` (bukan hard delete)** — Kalau baris dihapus saat
   revoke, kita tidak bisa membedakan "token belum pernah ada" vs "token sudah dipakai lagi".
   Dengan soft revoke, ketika token mati muncul lagi kita tahu pasti: token ini pernah aktif,
   sudah dirotasi, dan sekarang dipakai ulang — sinyal pencurian. Respons: revoke semua
   token user (paksa login ulang di semua perangkat).

4. **Logout butuh access token** — `POST /auth/logout` tidak `@Public()`. Ini memastikan
   hanya user yang benar-benar terautentikasi yang bisa logout — mencegah serangan yang
   "logout orang lain" dengan menebak cookie. Access token menghidentifikasi `userId`
   untuk revoke baris yang tepat.

5. **CSRF: diandalkan SameSite=Lax** — Karena setup satu domain, `SameSite=Lax` sudah
   mitigasi CSRF untuk sebagian besar kasus (browser tidak mengirim cookie pada cross-site
   POST dari origin lain). Jika setup berubah ke beda domain (`SameSite=None`), diperlukan
   proteksi CSRF eksplisit (double-submit token) sebelum production. Ini **utang keamanan
   yang tercatat** jika asumsi domain berubah.

## Belajar dari Sini

### Apa itu rotasi refresh token dan kenapa sekali pakai lebih aman?
Tanpa rotasi: refresh token bertahan lama dan bisa dipakai berkali-kali. Kalau bocor,
penyerang bisa terus membuat access token baru tanpa batas sampai token kadaluwarsa (7 hari).

Dengan rotasi: setiap kali dipakai, token lama langsung mati dan pasangan baru diterbitkan.
Kalau penyerang dapat token bocor, ia hanya punya satu kesempatan memakainya — setelah itu
token mati. Dan kalau penyerang lebih dulu pakai (sebelum user asli), user asli yang mencoba
refresh akan memicu reuse detection.

### Reuse detection: kenapa token-mati-dipakai-lagi = sinyal pencurian?
Dalam alur normal, user tidak pernah memakai token yang sudah dirotasi — browser selalu
punya token terbaru dari rotasi terakhir. Kalau token lama muncul lagi, ada dua kemungkinan:
1. Penyerang yang mencuri token lama mencoba memakainya, atau
2. Race condition (sangat jarang, biasanya bukan ini).

Karena kita tidak bisa membedakan keduanya dengan pasti, respons yang aman adalah
**revoke semua token user** (paksa login ulang di semua perangkat). Di sinilah soft revoke
2b berbayar: baris lama tidak dihapus, jadi kita bisa mendeteksi reuse.

### Kenapa refresh token di httpOnly cookie, bukan di body/localStorage?
`localStorage` bisa dibaca oleh JavaScript manapun di halaman yang sama — termasuk script
dari iklan, library pihak ketiga, atau XSS injection. Sekali kode jahat jalan di browser,
ia bisa mencuri semua isi localStorage.

Cookie `httpOnly` tidak bisa diakses JavaScript sama sekali — hanya browser yang tahu
isinya dan otomatis mengirimnya ke server sesuai aturan cookie. Ini bukan berarti aman
sepenuhnya, karena muncul kewajiban baru: **CSRF** (cookie dikirim otomatis oleh browser
bahkan dari halaman lain). Mitigasinya: `SameSite` dan CORS `credentials`. Keamanan tidak
hilang — ia pindah masalah.

### Pembagian access token vs refresh token
| | Access Token | Refresh Token |
|---|---|---|
| Letak | Body response → disimpan di memori JS | httpOnly cookie, path `/auth` |
| Cara kirim ke server | Header `Authorization: Bearer` | Otomatis oleh browser (cookie) |
| Umur | Pendek (15 menit) | Panjang (7 hari) |
| Tersimpan di DB | Tidak (stateless) | Ya (ter-hash, untuk revoke) |
| Tujuan | Akses route API | Mendapatkan access token baru |

### Konsekuensi asumsi domain
- **Satu domain (sekarang)**: `SameSite=Lax` cukup. Cookie hanya dikirim ke origin yang sama.
- **Beda domain**: `SameSite=None; Secure` — WAJIB HTTPS bahkan saat dev. Browser modern
  menolak cookie `SameSite=None` tanpa `Secure`. Perlu proteksi CSRF eksplisit tambahan.
