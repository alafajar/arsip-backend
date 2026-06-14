# Prompt 1 — Scaffolding Infra Backend & Database

Baca `CLAUDE.md` lebih dulu dan patuhi aturannya. Tugas: scaffolding fondasi backend dan
database untuk Sistem Dokumentasi Akreditasi. Ini tugas infra — boleh perubahan besar.

Sebelum mulai, buat `docs/tasks/001-scaffold-infra.md` dan isi sesuai format di CLAUDE.md.

Langkah:

1. Inisialisasi proyek NestJS 11 (CommonJS) dengan TypeScript strict. Pastikan jalan di
   Node.js 24 LTS.

2. Install & konfigurasi `@nestjs/config` untuk membaca `.env`.

3. Setup Prisma 7:
   - Jalankan `npx prisma init` (biarkan ia membuat blok `datasource` + `generator` yang
     benar untuk Prisma 7). JANGAN tulis ulang `generator` secara manual.
   - Masukkan enums & models dari `prisma/schema.prisma` yang sudah disediakan.
   - Bila ada keraguan sintaks v7, verifikasi ke dokumentasi resmi Prisma sebelum lanjut.

4. Konfigurasi koneksi PostgreSQL via `DATABASE_URL` di `.env`. Sediakan juga `.env.example`.
   Database lokal: PostgreSQL 17 (Postgres.app). Buat database bernama `akreditasi`.

5. Buat `PrismaModule` + `PrismaService` (global, terhubung saat onModuleInit, terputus saat
   onModuleDestroy). AKTIFKAN query logging Prisma (log SQL ke console) — ini wajib, untuk
   tujuan belajar.

6. Jalankan migrasi awal: `npx prisma migrate dev --name init` sehingga semua tabel dari
   schema terbentuk di database.

7. Buat struktur folder modular kosong (skeleton, siap diisi sprint berikutnya), minimal:
   `src/prisma`, `src/auth`, `src/users`, `src/menu`, `src/sheets`, `src/columns`,
   `src/rows`, `src/cells`, `src/imports`.
   JANGAN implementasi logika domain apa pun di prompt ini — cukup kerangka modul.

8. Buat endpoint health check `GET /health` yang mengembalikan status OK dan memverifikasi
   koneksi DB lewat satu query ringan.

9. Buat `README.md`: cara setup, variabel env, cara menjalankan, dan cara migrasi.

10. Update `docs/tasks/001-scaffold-infra.md`: daftar file yang dibuat/diubah + alasannya,
    keputusan kunci, dan bagian "Belajar dari sini" — jelaskan singkat untuk frontend
    engineer yang baru belajar backend: apa itu Prisma, peran `schema.prisma`, apa itu
    migrasi, dan kenapa `PrismaService` di-inject lewat dependency injection.

Definition of Done Prompt 1:
- `npm run start:dev` jalan tanpa error.
- `GET /health` mengembalikan OK + status DB terhubung.
- `npx prisma studio` menampilkan SEMUA tabel (kosong) sesuai schema.
- `docs/tasks/001-scaffold-infra.md` terisi lengkap.

JANGAN kerjakan auth, menu, atau import di prompt ini — itu untuk prompt-prompt berikutnya
(yang harus berupa perubahan kecil & incremental).
