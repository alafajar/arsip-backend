# Sistem Dokumentasi & Arsip Akreditasi (LAMTEK)

Web app untuk mendokumentasikan & mengarsipkan tabel akreditasi program studi.
Excel = impor awal; **database = source of truth**. Bukan replika Excel pixel-perfect,
melainkan engine tabel generik yang digerakkan data (dinamis, bukan satu tabel fisik per sheet).

## North Star (Sprint 1)
Membuktikan engine lewat satu demo nyata: sheet DTPS ("Data Dosen Tetap").

Definition of Done:
1. Admin login; peran admin & kaprodi (kaprodi view-only).
2. Admin membuat menu bertingkat (Jurusan > LAMTEK).
3. File Excel DTPS terunggah & terparse ke DB.
4. Tabel DTPS tampil benar: header gabung, NIDN nol-di-depan tetap utuh, kolom Link dapat diklik.
5. Admin bisa tambah/ubah/hapus baris; tersimpan.

Patokan: kalau sebuah pekerjaan tidak mendekatkan ke 5 poin ini, ia di luar Sprint 1.

## Tech Stack (versi terkunci — jangan diubah tanpa konfirmasi)
- Runtime: Node.js 24 LTS
- Framework: NestJS 11 (CommonJS — JANGAN pakai v12/ESM)
- Bahasa: TypeScript (strict mode)
- Database: PostgreSQL 17
- ORM: Prisma 7 (Rust-free client) — query logging WAJIB aktif (untuk belajar SQL)
- Parsing Excel: ExcelJS
- Auth: @nestjs/jwt + Passport; RBAC lewat Guard
- Validasi: class-validator + class-transformer
- Config: @nestjs/config
- Frontend (nanti): AG Grid Community (MIT, gratis komersial) — tentatif

## Model Data
Detail di `prisma/schema.prisma`. Inti: `users`, `menu_items` (hierarki via `parentId`),
`sheets`, `columns` (header bertingkat via `parentColumnId`; 7 tipe), `rows`,
`cells` (key-value: row x column -> value), `cell_merges`, `change_logs`.
PK = uuid. Add manual & import Excel sama-sama mengisi `columns`/`rows`/`cells`
(tidak ada tabel fisik baru per sheet).

## Aturan Workflow (WAJIB)
1. Sebelum mengerjakan apa pun: nyatakan ulang tugas dalam 1-2 kalimat, lalu buat file
   `docs/tasks/NNN-nama-tugas.md` (format di bawah).
2. **Perubahan kecil & incremental** per prompt, agar mudah direview & dipelajari —
   KECUALI scaffolding & infra (struktur folder, setup tooling, schema awal), di mana
   perubahan besar dalam sekali jalan diperbolehkan.
3. Setelah selesai: update file task dengan daftar file yang diubah + alasannya, keputusan
   kunci, dan bagian "Belajar dari sini" (penjelasan untuk frontend engineer yang sedang
   belajar backend).
4. Jangan menyentuh infra/schema pada prompt non-infra tanpa menyatakannya lebih dulu.

### Format file task (docs/tasks/NNN-*.md)
- Tujuan
- Rencana singkat
- File diubah (path + alasan)
- Keputusan kunci
- Belajar dari sini

## Konvensi Kode
- TypeScript strict; hindari `any` kecuali sangat terpaksa (beri komentar alasannya).
- Role enforcement di backend lewat Guard, BUKAN sekadar menyembunyikan tombol di frontend.
- Frontend: styling lewat lapisan design token (CSS variables / theme), token semantik
  (mis. `--color-primary`), NOL warna/ukuran hardcoded — agar re-theme dari desain final murah.
- Setiap perubahan skema lewat migrasi Prisma; jangan edit DB manual.
- Nama file & pesan commit deskriptif.

## Backlog Sprint 2 (sadari saat membangun; JANGAN implementasi sekarang)
- Admin membuat sheet manual dari web (UI: atur kolom -> tambah baris -> isi sel).
- Kolom formula tingkat-kolom dengan builder dibatasi tipe data (cegah error tipe).
  BUKAN referensi sel ala Excel (=C2+D2).
- Panel konfigurasi kolom & penggabungan; preview + konfirmasi saat import.
- Pencarian isi sel (index GIN pg_trgm pada `cells.value`).
- Riwayat versi dari `change_logs`; soft delete (`deletedAt`).
