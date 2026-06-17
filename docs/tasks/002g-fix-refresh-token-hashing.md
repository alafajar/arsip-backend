# 002g — Fix Refresh Token Hashing: bcrypt → SHA-256

## Tujuan
Mengganti bcrypt dengan SHA-256 untuk hashing refresh token agar seluruh token
(bukan hanya 72 byte pertama) ikut di-hash, sehingga reuse-detection dan lookup
bekerja benar.

## Rencana singkat
1. Buat `src/auth/token.util.ts` dengan helper `hashToken` (SHA-256).
2. Di `issueTokens`: ganti `hashPassword(refreshToken)` → `hashToken(refreshToken)`.
3. Di `refreshTokens`: ganti findMany + loop verifyPassword → `findFirst` by `tokenHash`.
4. Di `logout`: ganti findMany + loop → `updateMany` by `tokenHash`.

## File diubah
- `src/auth/token.util.ts` — **dibuat baru**; berisi `hashToken` menggunakan
  `node:crypto` SHA-256.
- `src/auth/auth.service.ts` — import `hashToken`; ganti penyimpanan hash di
  `issueTokens`; ganti lookup di `refreshTokens` dan `logout`.

## Keputusan kunci
- **Tidak ada perubahan schema / migrasi.** Kolom `refresh_tokens.tokenHash` tetap
  `TEXT`; kini berisi hex SHA-256 (64 karakter) bukan string bcrypt.
- Urutan pengecekan di `refreshTokens` dipertahankan persis: tidak-dikenal → expired
  → revoked (reuse detection) → rotasi.
- `password.util.ts` dan penggunaan bcrypt untuk password login **tidak disentuh** —
  bcrypt tetap tepat untuk password.

## Konsekuensi deploy
Baris `refresh_tokens` lama berisi hash bcrypt; setelah deploy lookup pakai SHA-256
sehingga tidak akan cocok. **Semua sesi aktif lama otomatis tidak valid; user harus
login ulang.** Ini membersihkan state rusak dan aman dilakukan. Opsional: truncate
tabel `refresh_tokens` sekali setelah deploy.

## Belajar dari sini

### Kenapa bcrypt memotong di 72 byte, dan kenapa itu merusak refresh token?
bcrypt berasal dari era kata sandi (maksimal puluhan karakter), sehingga secara
desain hanya memproses 72 byte pertama dari input. JWT refresh token panjangnya
~160+ byte dengan struktur `header.payload.signature`. Bagian yang membuat setiap
token unik adalah **signature** (bagian akhir, bukan 72 byte pertama). Karena
signature dipotong, seluruh token satu user berbagi 72 byte pertama yang identik
(header + awal klaim `sub`). Akibatnya `bcrypt.compare(tokenManaPun, hashManaPun)`
untuk user yang sama selalu mengembalikan `true` — reuse-detection lumpuh total.

### Kenapa SHA-256 tepat untuk token, tapi bcrypt tetap tepat untuk password?
bcrypt sengaja lambat (cost factor) untuk memperlambat brute-force pada nilai
**low-entropy** seperti kata sandi manusia yang bisa ditebak. Refresh token
adalah nilai **high-entropy** (128-bit acak dari signature JWT): tidak ada yang bisa
brute-force 2^128 kemungkinan. Maka hash cepat seperti SHA-256 cukup, dan jauh
lebih efisien — tidak ada cost faktor yang perlu diulang setiap request refresh.

### Kenapa lookup hash eksak menghapus loop dan masalah non-determinisme?
Loop `verifyPassword` lama mencari satu per satu sampai menemukan yang cocok.
Dengan hash deterministik, `findFirst({ where: { tokenHash: sha256(rawToken) } })`
langsung menemukan baris yang tepat dalam satu query database — tidak ada iterasi,
tidak ada risiko menemukan baris salah urutan, dan tidak ada N query bcrypt per
request.
