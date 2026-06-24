# Reset Database & Seed

## 1. Kosongkan Database

```bash
pnpm prisma migrate reset
```

Ini akan drop semua tabel, jalankan ulang semua migrasi, lalu otomatis menjalankan seed.
**Langsung lompat ke langkah 3 jika pakai cara ini.**

---

Atau, kalau hanya ingin hapus data tanpa menyentuh skema:

```bash
psql $DATABASE_URL
```

```sql
TRUNCATE TABLE change_logs, cell_merges, cells, rows, columns, sheets, excel_imports, refresh_tokens, menu_items, users CASCADE;
```

---

## 2. Pastikan `.env` Sudah Diisi

```env
DATABASE_URL=postgresql://...
SEED_ADMIN_PASSWORD=isipasswordadmin
SEED_KAPRODI_PASSWORD=isipasswordkaprodi
```

---

## 3. Jalankan Seed

```bash
pnpm prisma db seed
```

Yang akan terisi:

| Tabel       | Isi                                                      |
|-------------|----------------------------------------------------------|
| users       | `admin@kampus.ac.id` (ADMIN), `kaprodi@kampus.ac.id` (KAPRODI) |
| menu_items  | Kriteria > DTPS, Profil Dosen; Kurikulum                 |
| sheets      | DTPS                                                     |
| columns     | 7 kolom daun + 1 grup "Kualifikasi Akademik"             |
| rows + cells| 3 baris contoh DTPS                                      |

---

## 4. Import Data Nyata

Lakukan dari frontend setelah login sebagai admin.
Baris contoh dari seed akan tertimpa/terpisah dari data hasil import (sheet berbeda).
