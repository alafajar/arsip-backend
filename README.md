# Sistem Dokumentasi & Arsip Akreditasi — Backend

Backend NestJS 11 untuk mendokumentasikan & mengarsipkan tabel akreditasi program studi.

## Prasyarat

- Node.js 24+ LTS (atau 25+)
- pnpm 10+
- PostgreSQL 17 (Postgres.app atau instalasi lokal)

## Setup

```bash
# Install dependensi
pnpm install

# Buat file .env dari contoh
cp .env.example .env
# Edit .env, sesuaikan DATABASE_URL dengan user PostgreSQL lokal:
# DATABASE_URL="postgresql://YOUR_USER@localhost:5432/akreditasi"

# Buat database
createdb akreditasi

# Generate Prisma client
pnpm prisma:generate

# Jalankan migrasi awal (membuat semua tabel)
pnpm prisma:migrate
```

## Menjalankan

```bash
# Development (dengan ts-node, hot reload manual)
pnpm start:dev

# Build ke JavaScript
pnpm build

# Production
pnpm start
```

## Environment Variables

| Variabel       | Contoh                                          | Keterangan                      |
|----------------|-------------------------------------------------|---------------------------------|
| DATABASE_URL   | postgresql://user@localhost:5432/akreditasi     | Koneksi PostgreSQL              |
| PORT           | 3000                                            | Port HTTP server (default 3000) |

## Prisma

```bash
# Generate ulang client setelah ubah schema
pnpm prisma:generate

# Buat migrasi baru setelah ubah schema
pnpm prisma:migrate

# Buka Prisma Studio (GUI tabel)
pnpm prisma:studio
```

## Verifikasi

```bash
# Health check — harus mengembalikan {"status":"ok","db":"connected"}
curl http://localhost:3000/health
```

## Struktur Folder

```
src/
  main.ts           # Entry point
  app.module.ts     # Root module
  prisma/           # PrismaService (global, query logging aktif)
  health/           # GET /health
  auth/             # (Sprint 2) JWT auth, login
  users/            # (Sprint 2) User management
  menu/             # (Sprint 2) Hierarki menu
  sheets/           # (Sprint 2) Sheet management
  columns/          # (Sprint 2) Kolom & header bertingkat
  rows/             # (Sprint 2) Baris data
  cells/            # (Sprint 2) Sel (key-value)
  imports/          # (Sprint 2) Import Excel
prisma/
  schema.prisma     # Schema database
  migrations/       # Riwayat migrasi SQL
generated/
  prisma/           # Prisma client (auto-generated, jangan edit)
```
