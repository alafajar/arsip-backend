# 002b — Endpoint Login (Access + Refresh Token)

## Tujuan
Tambah `username` ke model User, model `RefreshToken`, dan endpoint `POST /auth/login`
yang menerbitkan access token (15m) + refresh token (7d). Refresh token disimpan ter-hash
di DB dan bisa di-revoke. Belum ada guard, refresh, atau logout di prompt ini.

## Rencana Singkat
1. Update schema: tambah `username` ke User + model `RefreshToken`.
2. Migrasi manual (karena ada baris existing yang tidak boleh dibuang).
3. Generate ulang Prisma client.
4. Update seed.ts: isi `username` pada upsert.
5. Build `auth.service.ts`: `validateUser`, `issueTokens`, `setNewPassword`, `login`.
6. Build `auth.controller.ts`: `POST /auth/login` + DTO.
7. Daftarkan JwtModule di AuthModule.

## File Diubah

| File | Alasan |
|------|--------|
| `prisma/schema.prisma` | Tambah `username` ke User; tambah model `RefreshToken` + relasi balik |
| `prisma/migrations/20260614070000_.../migration.sql` | Migrasi manual: add nullable → fill → set NOT NULL (handle existing rows) |
| `generated/prisma/` | Re-generate setelah schema berubah |
| `prisma/seed.ts` | Tambah `username` pada create & update di upsert |
| `.env` | Tambah JWT_ACCESS_SECRET, JWT_ACCESS_EXPIRES, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES |
| `.env.example` | Tambah placeholder 4 env JWT |
| `src/auth/dto/login.dto.ts` | DTO validasi body POST /auth/login |
| `src/auth/auth.service.ts` | `validateUser`, `issueTokens`, `setNewPassword`, `login` |
| `src/auth/auth.controller.ts` | POST /auth/login |
| `src/auth/auth.module.ts` | Import JwtModule; export AuthService |

## Keputusan Kunci

1. **Migrasi manual untuk kolom NOT NULL pada tabel berisi data** — Prisma `migrate dev`
   menolak ADD COLUMN NOT NULL tanpa default jika tabel sudah ada baris. Solusi: tulis SQL
   sendiri (add nullable → UPDATE → set NOT NULL), simpan di folder migrations, apply lewat
   `prisma migrate deploy`.

2. **`expiresIn: value as any`** — `@nestjs/jwt` v11 menggunakan branded type `StringValue`
   dari library `ms` untuk `expiresIn`. String biasa dari `ConfigService` tidak compatible
   secara tipe, meski valid secara runtime. `as any` dipakai karena ini constraint library,
   bukan logika bisnis; perilaku runtime tetap benar.

3. **Pesan error login generik** — `validateUser` melempar pesan yang sama ("Username atau
   password salah") baik untuk user tidak ditemukan, password salah, maupun `isActive: false`.
   Ini mencegah penyerang menebak apakah username tertentu terdaftar atau tidak.

4. **`update: { username: 'admin' }` pada upsert seed** — Upsert sekarang mengisi
   `username` jika update (bukan hanya create), sehingga user yang sudah ada dari seed
   sebelumnya ikut ter-update.

5. **`setNewPassword` sebagai fungsi mandiri** — Belum dipakai endpoint mana pun di 2b,
   tapi dibuat sekarang agar endpoint "admin reset password kaprodi" nanti tinggal memanggil
   fungsi ini — tanpa menulis ulang logika hashing.

## Belajar dari Sini

### Beda access token vs refresh token
**Access token** berumur pendek (15 menit) dan *stateless* — server bisa memverifikasinya
hanya dengan signature JWT, tanpa cek database. Kalau bocor, risikonya kecil karena cepat
kadaluwarsa.

**Refresh token** berumur panjang (7 hari) dan *stateful* — disimpan (ter-hash) di database
agar bisa di-revoke kapan saja. Dipakai untuk menukar access token baru tanpa login ulang.
Kalau refresh token disimpan hanya di JWT tanpa database, tidak ada cara membatalkannya
sebelum kadaluwarsa — berbahaya kalau bocor.

### Kenapa refresh token disimpan ter-hash?
Sama alasannya dengan password: kalau tabel `refresh_tokens` bocor, penyerang hanya melihat
hash (`$2b$12$...`), bukan token yang bisa langsung dipakai. Token mentah hanya ada sekali —
saat pertama dibuat — dan dikembalikan ke client. Server tidak pernah menyimpan nilai mentahnya.

### Apa itu soft revoke (`revokedAt`)?
Alih-alih menghapus baris dari database, kita mengisi kolom `revokedAt` dengan timestamp.
Keuntungan: baris yang sudah di-revoke tetap ada sebagai riwayat. Kalau refresh token yang
sudah di-revoke dicoba dipakai lagi (tanda pencurian token), server bisa mendeteksi dan
mencatat kejadian itu — tidak mungkin dilakukan kalau barisnya langsung dihapus.

### Kenapa pesan error login dibuat generik?
Kalau server mengembalikan "Username tidak ditemukan" vs "Password salah", penyerang bisa
enumerasi — mencoba banyak username untuk tahu mana yang terdaftar. Pesan generik memutus
informasi itu. Ini prinsip *don't leak existence* yang berlaku luas di autentikasi.

### Kenapa `setNewPassword` dipisah jadi fungsi sendiri?
Satu prinsip desain: *single responsibility*. Fungsi hanya tahu cara hash + update.
Siapa yang boleh memanggil, itu urusan Guard/Controller di luar. Dengan cara ini, fitur
"admin reset password kaprodi" cukup memanggil `authService.setNewPassword(userId, newPass)`
tanpa menulis ulang logika hashing — dan fungsi yang sama bisa dipakai untuk fitur
"ganti password sendiri" nanti.
