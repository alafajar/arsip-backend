# 001 — Scaffold Infra Backend & Database

## Tujuan
Menyiapkan fondasi backend NestJS 11 (CommonJS, TypeScript strict) lengkap dengan Prisma 7,
koneksi PostgreSQL 17 via driver adapter pg, PrismaModule/PrismaService (query logging aktif),
struktur folder modular, health check endpoint `GET /health`, dan migrasi awal.

## Rencana Singkat
1. Init proyek (package.json) — gunakan pnpm (node_modules sudah pnpm).
2. Install NestJS 11, @nestjs/config, Prisma 7 rust-free, pg adapter, class-validator, dst.
3. Merge generator block Prisma 7 ke schema.prisma; buat prisma.config.ts untuk koneksi CLI.
4. Generate Prisma client; jalankan migrasi awal.
5. Buat PrismaModule + PrismaService global (pg adapter + query logging).
6. Buat skeleton modul (auth, users, menu, sheets, columns, rows, cells, imports).
7. Buat endpoint GET /health.
8. Buat README.md.

## File Diubah

| File | Alasan |
|------|--------|
| `package.json` | Init proyek, scripts (start:dev, build, prisma:*), pnpm.onlyBuiltDependencies |
| `tsconfig.json` | TypeScript strict + CommonJS + decorators |
| `tsconfig.build.json` | Build config (exclude test/dist) |
| `.env` | DATABASE_URL lokal (postgresql://alafajar@localhost:5432/akreditasi) |
| `.env.example` | Template env untuk onboarding developer baru |
| `prisma/schema.prisma` | Tambah generator block Prisma 7; hapus `url` dari datasource |
| `prisma.config.ts` | Konfigurasi Prisma CLI (url, migrasi path) untuk Prisma 7 |
| `prisma/migrations/` | Migrasi awal `init` — membuat semua tabel di DB |
| `generated/prisma/` | Prisma client hasil generate (auto-generated) |
| `src/main.ts` | Entry point NestFactory |
| `src/app.module.ts` | Root module — import ConfigModule, PrismaModule, semua skeleton |
| `src/prisma/prisma.service.ts` | PrismaService dengan pg adapter + query logging |
| `src/prisma/prisma.module.ts` | Global module untuk PrismaService |
| `src/health/health.controller.ts` | GET /health — verifikasi koneksi DB |
| `src/auth/auth.module.ts` | Skeleton |
| `src/users/users.module.ts` | Skeleton |
| `src/menu/menu.module.ts` | Skeleton |
| `src/sheets/sheets.module.ts` | Skeleton |
| `src/columns/columns.module.ts` | Skeleton |
| `src/rows/rows.module.ts` | Skeleton |
| `src/cells/cells.module.ts` | Skeleton |
| `src/imports/imports.module.ts` | Skeleton |
| `README.md` | Setup, env vars, cara run, cara migrasi |

## Keputusan Kunci

1. **pnpm bukan npm** — node_modules sudah berstruktur pnpm (ada `.pnpm/`). Mencoba npm install
   menghasilkan error arborist. Gunakan pnpm konsisten ke depan.

2. **Prisma 7 breaking change** — Prisma 7 tidak lagi mendukung `url` di `datasource` block
   dalam `schema.prisma`. URL koneksi harus dipindah ke dua tempat:
   - `prisma.config.ts` → untuk CLI (migrate, studio, generate)
   - `PrismaClient` constructor via driver adapter `@prisma/adapter-pg` → untuk runtime

3. **Driver adapter pg** — Prisma 7 memerlukan driver adapter eksplisit (`@prisma/adapter-pg`)
   untuk koneksi langsung ke PostgreSQL. Connection string diberikan ke konstruktor `PrismaPg`.

4. **Import path client Prisma 7** — Output generate ada di `generated/prisma/client.ts`
   (bukan `index.ts` seperti Prisma sebelumnya). Import harus ke `.../prisma/client`, bukan
   direktori.

5. **`@Global()` pada PrismaModule** — PrismaService cukup di-declare sekali di PrismaModule
   dan otomatis tersedia di seluruh modul tanpa perlu import berulang. Ini pattern standar
   untuk shared resource seperti DB connection.

## Belajar dari Sini

### Apa itu Prisma dan peran `schema.prisma`?
Prisma adalah ORM (Object-Relational Mapper) yang menjembatani TypeScript dan database.
`schema.prisma` adalah "blueprint" database kita — di sini kita deklarasikan tabel apa saja
yang ada, kolom apa, tipe datanya apa, dan relasi antar tabel. Prisma membaca file ini untuk:
- Membuat/mengupdate tabel di database (lewat migrasi)
- Men-generate TypeScript types yang type-safe untuk query

### Apa itu migrasi Prisma?
Migrasi adalah cara kita mengubah skema database secara terkontrol. Setiap `prisma migrate dev`
menghasilkan file SQL di `prisma/migrations/` yang mencatat perubahan. Ini penting karena:
- Perubahan bisa di-review sebelum diapply
- Tim bisa sinkron — developer lain tinggal `prisma migrate dev` untuk apply migrasi yang ada
- Production deployment bisa pakai `prisma migrate deploy` yang hanya apply migrasi baru

### Kenapa PrismaService di-inject lewat Dependency Injection?
NestJS menggunakan pola Dependency Injection (DI) — alih-alih komponen membuat instance sendiri,
mereka "minta" dari container NestJS. Keuntungannya:
- Satu instance PrismaService untuk seluruh app (tidak buka banyak koneksi DB)
- Mudah di-mock saat testing
- Lifecycle (connect/disconnect) dikelola oleh NestJS, bukan manual
