# 002a — Hashing Password + Seed Admin

## Tujuan
Menyiapkan hashing password dan seed dua user awal (admin & kaprodi) ke database.
Tidak ada endpoint atau auth logic di prompt ini.

## Rencana Singkat
1. Install `bcrypt` + `@types/bcrypt`.
2. Buat `src/auth/password.util.ts` — `hashPassword` dan `verifyPassword`.
3. Buat `prisma/seed.ts` — upsert admin & kaprodi, password dari env.
4. Daftarkan seed di `prisma.config.ts` (Prisma 7 tidak baca dari `package.json` lagi).
5. Jalankan seed, verifikasi di DB.

## File Diubah

| File | Alasan |
|------|--------|
| `src/auth/password.util.ts` | Helper `hashPassword` dan `verifyPassword` berbasis bcrypt |
| `prisma/seed.ts` | Upsert admin & kaprodi; password dari env |
| `prisma.config.ts` | Tambah `migrations.seed` — Prisma 7 membaca seed dari sini |
| `package.json` | Tetap ada `prisma.seed` (untuk dokumentasi), tapi Prisma 7 pakai config.ts |
| `.env` | Tambah `SEED_ADMIN_PASSWORD` dan `SEED_KAPRODI_PASSWORD` |
| `.env.example` | Tambah placeholder dua env seed |

## Keputusan Kunci

1. **Prisma 7 seed di `prisma.config.ts`** — Di Prisma 7, perintah seed tidak lagi dibaca dari
   `package.json` (`prisma.seed`), melainkan dari `migrations.seed` di `prisma.config.ts`.
   Seed command menggunakan path absolut ke `./node_modules/.bin/ts-node` karena Prisma
   memanggil perintah tanpa mengetahui PATH proyek.

2. **bcrypt salt rounds = 12** — Salt rounds 12 adalah keseimbangan antara keamanan dan
   performa; 10 terlalu cepat untuk server modern, 14 terlalu lambat untuk login.

3. **`update: {}`** — Upsert dengan `update: {}` berarti: kalau user sudah ada, tidak ada
   yang diubah (idempoten). Ini aman untuk dijalankan berulang kali tanpa mereset password.

## Belajar dari Sini

### Apa itu hashing password dan kenapa plaintext tidak boleh disimpan?
Hashing adalah proses satu arah — teks diubah jadi string acak dan tidak bisa dikembalikan.
Kalau database bocor, penyerang hanya melihat hash (`$2b$12$...`), bukan password asli.
Bcrypt secara khusus dirancang lambat (sengaja), sehingga brute-force memerlukan waktu sangat
lama. Berbeda dengan enkripsi (dua arah), hash tidak bisa di-decrypt — verifikasi dilakukan
dengan me-hash ulang input dan membandingkan hasilnya.

### Apa itu upsert?
Upsert = "insert or update". Kalau data dengan kondisi `where` tidak ditemukan → lakukan
`create`. Kalau sudah ada → lakukan `update`. Ini berguna untuk seed agar script bisa
dijalankan berulang kali tanpa error duplikat atau mereset data yang sudah ada.

### Kenapa password diambil dari env, bukan ditulis di kode?
Kode masuk ke git — siapa pun yang bisa membaca repository bisa melihat password. File `.env`
tidak di-commit (ada di `.gitignore`), sehingga nilai sensitif tetap privat. Ini adalah
prinsip "secrets out of code" yang berlaku tidak hanya untuk password tapi juga API key,
connection string, dan konfigurasi sensitif lainnya.
