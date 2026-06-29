# Audit Sprint 1 — Sistem Dokumentasi & Arsip Akreditasi (Backend)

**Tanggal Audit:** 2026-06-20 — **Diperbarui:** 2026-06-27 (lihat Addendum #2)
**Auditor:** Staff Software Engineer / Solution Architect Review
**Cakupan:** Backend NestJS 11 + Prisma 7 + PostgreSQL 17 (Sprint 1 deliverables)
**Total source files:** 35 file (~2,214 LOC di `src/` per 2026-06-27)

---

## 1. Executive Summary

### Kondisi Saat Ini
Backend Sprint 1 menjalankan seluruh **5 Definition of Done** (DoD) dengan tertib: autentikasi JWT + refresh, RBAC ADMIN/KAPRODI, import Excel multi-sheet (DTPS semantik + cermin grid), CRUD baris, dan manajemen menu bertingkat. Engine tabel generik (EAV: `Sheet → Column → Row → Cell`) sudah membuktikan diri lewat sheet DTPS — NIDN nol-di-depan utuh, header bertingkat ("Kualifikasi Akademik") direpresentasikan via `parentColumnId`, dan tidak ada baris hantu dari B34.

Kualitas implementasi **konsisten dan disiplin**: setiap slice punya task log, pola guardrail C (validasi → transaksi → audit) diterapkan seragam di semua endpoint tulis, dan tes negatif terverifikasi (401/403/404/400/422).

### Tingkat Kematangan: **MVP (akhir Sprint 1)**

| Tahap | Status | Catatan |
|---|---|---|
| Prototype | ✅ Lewat | Engine generik sudah membuktikan satu sheet nyata |
| **MVP** | ✅ **Sedang di sini** | DoD #1–#5 lulus; backend siap dipasangi frontend |
| Beta | ❌ Belum | Belum ada test suite, monitoring, soft delete |
| Production Ready | ❌ Belum | Lihat §7 & §12 — gap keamanan dan operasional masih ada |

**Verdict satu kalimat:** *Backend ini layak untuk demo internal dan dipasangi frontend Sprint 2 — tapi belum siap meninggalkan environment dev tanpa pekerjaan lanjutan di test suite, hardening keamanan, dan observability.*

---

## 2. What Has Been Built

### 2.1 Autentikasi & Otorisasi
| Fitur | Endpoint | Value |
|---|---|---|
| Login JWT | `POST /auth/login` | Identitas user, sesi terikat |
| Refresh rotation + reuse detection | `POST /auth/refresh` | Sesi panjang tanpa mengorbankan keamanan; pencurian token terdeteksi |
| Logout (revoke) | `POST /auth/logout` | Sesi dapat diakhiri secara eksplisit |
| Identitas saat ini | `GET /auth/me` | Frontend tahu siapa yang login |
| Rate limiting (login 5/menit, refresh 10/menit) | global ThrottlerGuard | Mitigasi brute force |
| RBAC ADMIN/KAPRODI via Guard server | `@Roles(Role.ADMIN)` | Otorisasi bukan sekadar sembunyi tombol |

### 2.2 Map / Navigasi
| Fitur | Endpoint |
|---|---|
| Pohon menu | `GET /menus` |
| Buat node | `POST /menus` (ADMIN) |
| Rename / pindah node | `PATCH /menus/:id` (ADMIN, dengan deteksi siklus) |
| Hapus node kosong | `DELETE /menus/:id` (ADMIN, 409 jika punya anak/sheet) |

### 2.3 Sheet (baca lengkap + tulis baris)
| Fitur | Endpoint |
|---|---|
| Metadata sheet | `GET /sheets/:id` |
| Pohon kolom (header bertingkat) | `GET /sheets/:id/columns` |
| Baris ter-pivot + pagination | `GET /sheets/:id/rows?limit=50&offset=0` |
| Tambah baris (atomik + audit) | `POST /sheets/:id/rows` (ADMIN, 409 jika `isReadOnly`) |
| Edit baris (upsert + delete-on-empty) | `PATCH /sheets/:id/rows/:rowId` (ADMIN, 409 jika `isReadOnly`) |
| Hapus baris (cascade Cell + snapshot audit) | `DELETE /sheets/:id/rows/:rowId` (ADMIN, 409 jika `isReadOnly`) |

### 2.4 Import Excel (T5)
| Fitur | Endpoint |
|---|---|
| Upload + parse semua worksheet | `POST /imports` (ADMIN, multipart) |
| Jalur **semantik** untuk DTPS | otomatis (nama "Data Dosen Tetap") |
| Jalur **cermin grid** untuk sisanya | semua sheet lain, `isReadOnly=true` |
| Audit `ExcelImport` + `ChangeLog` | otomatis |

### 2.5 Infrastruktur Pendukung
- `GET /health` (DB ping)
- Prisma 7 Rust-free client + adapter PostgreSQL
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform)
- Throttler global (config dari env)
- Trust proxy toggle untuk IP nyata di belakang reverse proxy
- 3 migrasi terlacak: `init`, `add_username_and_refresh_token`, `add_sheet_isreadonly`

---

## 3. Strengths

### 3.1 Disiplin Workflow Top-Tier
Setiap slice (19 task log di `docs/tasks/`) mengikuti pola yang sama: **Tujuan → Rencana → File diubah → Keputusan kunci → Belajar dari sini**. Dampak: developer baru bisa membaca histori keputusan tanpa menebak. Praktik ini lebih ketat daripada banyak project komersial.

### 3.2 Engine Generik yang Tepat untuk Use Case
Model EAV (`Sheet → Column → Row → Cell`) dengan `parentColumnId` untuk header bertingkat adalah pilihan benar untuk "57 sheet dengan struktur berbeda-beda". Alternatif (satu tabel fisik per sheet) akan menjadi mimpi buruk skema.

### 3.3 Anti-N+1 Konsisten
- Pohon menu: 1 query + map-in-memory di `MenusService.getTree`
- Pohon kolom: 1 query + tree builder di `SheetsService.getColumns`
- Pivot cell: 1 query baris + 1 query cell (Promise.all dengan count), pivot di memori di `SheetsService.getRows`
- Import: `createMany` per batch (kolom/baris/cell/merge) — bukan loop per-item

### 3.4 Refactor Refresh Token (002g) Adalah Highlight
Mengganti bcrypt (yang **memotong di 72 byte** dan membuat lookup token broken) → SHA-256 dengan lookup eksak. Ini bug subtle yang melumpuhkan reuse-detection. Diagnosis benar, fix tepat, task log menjelaskan *kenapa*.

### 3.5 Validasi Berlapis di Tulis (Guardrail C)
Setiap endpoint tulis fail-fast SEBELUM transaksi: cek sheet → leaf map → duplikat columnId → tipe per kolom. Baru setelah lolos, masuk `$transaction` yang berisi tulis + audit. Tidak ada baris setengah jadi.

### 3.6 Validator Tipe Kolom Mandiri (`column-value.validator.ts`)
Diletakkan di `src/columns/` (bukan `src/sheets/`) sehingga import (T5) bisa memakainya ulang tanpa coupling ke `SheetsService`. Fungsi murni, mudah di-unit-test (meskipun belum ditest).

### 3.7 ValidationPipe Global = Secure by Default
`whitelist + forbidNonWhitelisted + transform` di `main.ts` — field asing langsung 400. Mencegah error "lupa @UsePipes" yang sering terjadi di NestJS.

### 3.8 Snapshot Audit Sebelum Delete
`ChangeLog.beforeData` menyimpan isi baris yang dihapus *sebelum* `tx.row.delete`. Audit dan delete berada di transaksi yang sama — rollback atomik.

### 3.9 Read-Only Write Guard (T7, post-audit)
Helper privat `assertWritableSheet(sheetId)` di `SheetsService` dipanggil di awal `createRow`/`updateRow`/`deleteRow` sebelum transaksi tulis. Sheet cermin grid (`isReadOnly: true`, mis. EWMP) menolak operasi tulis dengan **409 Conflict** + pesan "Sheet ini hanya-baca dan tidak bisa diubah". Kode 409 sengaja dibedakan dari 403 (role tidak cukup) agar frontend bisa menampilkan pesan yang tepat — *bukan masalah peran, melainkan keadaan resource*. Satu pintu masuk untuk tiga method tulis: kalau besok ada cek tambahan (mis. lock sementara), cukup ubah di satu tempat.

---

## 4. Weaknesses

### 4.1 Tidak Ada Test Suite Sama Sekali (CRITICAL gap)
**0 file** `.spec.ts` / `.test.ts`. Semua verifikasi manual via curl. Tidak ada jaring pengaman saat refactor — bug 3e-create-row (`@IsUUID` menolak UUID sentinel) baru ketahuan saat tes manual. Kalau ada test suite, ini akan tertangkap CI sebelum merge.

### 4.2 Stub Module Mati di `app.module.ts`
`CellsModule`, `RowsModule`, `UsersModule`, `ColumnsModule` di-`import` tapi isinya `@Module({})` kosong. Ini noise — developer baru akan mengira "ada modul Users, mungkin di sana logiknya". Hapus saja, atau pakai folder tanpa module sampai dibutuhkan.

### 4.3 `console.log` di Production Code
`main.ts:35` — `console.log('Application running on port ${port}')`. Bukan masalah besar, tapi tidak ada logger structured. Saat error terjadi di production, hanya stderr terabaikan yang menerima — tidak ada trace ID, tidak ada level filter.

### 4.4 Route Uji `test-read` & `test-write` Masih di `auth.controller.ts`
Baris 59 & 65 — peninggalan slice 002d untuk verifikasi RBAC. Sudah selesai tugasnya. Sekarang menjadi surface area API yang tidak perlu. **Hapus.**

### 4.5 Service Tunggal Membengkak: `SheetsService` (343 LOC, 6 metode)
Mencampur: read columns, read rows, create row, update row, delete row, plus metadata sheet. Sudah mulai berat. Sprint 2: split menjadi `SheetReadService`, `SheetRowsService` (atau pindah ke `RowsModule` yang masih kosong).

### 4.6 Query Logging Prisma Selalu Aktif (`['query', 'info', 'warn', 'error']`)
Di `prisma.service.ts` — bagus untuk dev (learning SQL), **berbahaya di prod** (membocorkan nilai query ke log, termasuk passwordHash, refreshToken hash, NIDN). FIX 3 di prompt fix-auth-defects sengaja diberi label "opsional" dan tidak dikerjakan. **Wajib dibedakan per `NODE_ENV` sebelum production.**

### 4.7 Tipe `tx: any` di `ImportsService.writeDtpsToTx` / `writeGridToTx`
ESLint-disabled karena Prisma v7 tidak mengekspor `TransactionClient` secara mudah. Type safety lemah di blok kritis. Workaround minimal: `Parameters<typeof this.prisma.$transaction>[0]` atau definisikan helper type.

### 4.8 `storagePath: 'not-persisted'` Adalah Magic String
Sekarang berfungsi sebagai sentinel "tidak ada file fisik" tapi tidak ada konstanta atau enum. Sprint 2 saat menambah storage real harus hati-hati: query "ExcelImport WHERE storagePath != 'not-persisted'" akan rapuh.

### 4.9 Tidak Ada Index `RefreshToken(tokenHash)` 
`auth.service.ts:104` melakukan `findFirst({ where: { userId, tokenHash } })`. Schema hanya `@@index([userId])`. Untuk user dengan banyak sesi aktif (admin di banyak device), lookup masih scan sequential per user. Tambah `@@index([tokenHash])` atau composite `@@index([userId, tokenHash])`.

### 4.10 Cell Mirror Grid Sheet Menyimpan Header sebagai Data
Sheet cermin (non-DTPS) menyimpan **semua** baris Excel sebagai `Row`, termasuk baris header asli. Tanpa metadata "ini baris ke berapa = header", frontend harus menebak. Dokumentasi `004-import-multisheet.md` menyebutkan ini sebagai "frontend boleh menyembunyikan A/B/C" — tapi tidak ada flag/metadata di DB. **Ambigu untuk sprint berikutnya.**

### 4.11 Kolom `ExcelImport.storagePath` Wajib (NOT NULL) Padahal Belum Dipakai
Schema memaksa isi field yang konsepnya belum dipakai di Sprint 1. Sekarang: diisi placeholder. Sprint 2: harus migrasi `storagePath String?` (nullable) atau biarkan sentinel. **Keputusan tertunda.**

### 4.12 Cookie Refresh: `path: '/auth'` (sempit) tapi Refresh & Logout Memang di `/auth/*`
Cocok. Tapi: tidak ada SameSite=Strict di production config — env saat ini `lax`. Untuk Sprint 2 dengan frontend SPA cross-origin, perlu `none + secure` di prod. Dokumen ulang ekspektasi env.

### 4.13 Duplikasi Logika "Bangun Cells Map" di 3 Tempat
- `getRows`: init semua columnId = null, fill dari cells row
- `createRow`: init semua columnId = null, fill dari dto
- `updateRow`: re-fetch cells, init semua columnId = null, fill dari cells

Pola sama: `Record<columnId, value|null>`. Ekstrak helper `pivotCellsForRow(allColumnIds, cells): Record<string, string|null>`.

### 4.14 DTPS Header Parse Hardcoded `MAIN_HEADER_ROW=2`
Hanya berlaku jika file DTPS persis seperti contoh saat ini. File berbeda (versi baru, formatting beda) akan gagal silent — `parseDtpsHeaders` mengembalikan array kosong → sheet di-skip → frontend bingung. Tambah validasi: "jika sheet DTPS terdeteksi tapi header gagal → 422 dengan pesan jelas".

### 4.15 Tidak Ada Idempotency Key untuk Import
Re-upload file yang sama → **dua workbook MenuItem terpisah**, kolom/baris terduplikasi. Tidak ada cara user mendeteksi atau mencegah ini. Sprint 2: hash file + cek di `ExcelImport.fileHash`, atau dialog konfirmasi.

### 4.16 Unused Import `BadRequestException` di `imports.service.ts`
(Sudah diperbaiki di sesi ini.)

---

## 5. Architecture Review

### Folder Structure: 8/10
```
src/
  auth/        ✅ Sangat lengkap: decorators, dto, filters, guards, strategies, utils
  columns/     ✅ Validator mandiri (reusable)
  sheets/      ⚠️ Service membengkak — tampung semua CRUD baris
  menu/        ✅ Bersih (dto, controller, service)
  imports/     ✅ Service 520 LOC tapi memang complex parser
  health/      ✅ Minimal, cukup
  prisma/      ✅ Global module
  cells/ rows/ users/  ❌ Stub kosong (lihat §4.2)
  main.ts, app.module.ts
```

**Plus:** Decorator + Guard + DTO + Service pattern khas NestJS diikuti benar. **Minus:** Stub kosong menyesatkan; `sheets/` perlu dipecah.

### Separation of Concerns: 8/10
Controller tipis → Service tebal → PrismaService di bawah. Tidak ada bisnis logik di controller. Validator tipe dipisahkan dari service penulis. **Skor terpotong:** `SheetsService` mencampur tanggung jawab read & write — wajar di Sprint 1, harus dipecah di Sprint 2.

### Modularitas: 7/10
Module NestJS dipakai tapi setengah hati (stub kosong). `PrismaModule` Global benar. Tidak ada circular dependency. Skor terpotong karena module yang sebenarnya tidak ada (Cells, Rows, Users) tetap dideklarasikan.

### Reusability: 8/10
- `column-value.validator.ts` — fungsi murni, reusable ✅
- `password.util.ts` + `token.util.ts` — utility murni ✅
- Guard ditempel global via `APP_GUARD` ✅
- **Tapi:** logika "build cells map" terulang 3x (lihat §4.13).

### Scalability: 6/10
- Model EAV → fleksibel tapi query "pivot 1000 baris × 50 kolom = 50k cell" akan berat. Sudah ada `@@index([sheetId])`, `@@index([columnId])` di Cell. Belum ada `@@index([rowId, columnId])` — tapi ada unique-nya. Aman.
- Tidak ada caching layer. `GET /menus` selalu memuat seluruh tabel `menu_items`. Untuk skala 50–500 menu = OK. Untuk skala 5,000+ = perlu pagination atau cursor.
- Import single-threaded di event loop → file 100MB dengan 60 sheet akan memblok server. Worker thread / queue (BullMQ) = Sprint 2+.

### Maintainability: 8/10
- Task log lengkap.
- Komentar mengutamakan WHY bukan WHAT.
- Naming konsisten (Indonesian-English mix tapi konsisten).
- Skor terpotong karena tidak ada test suite — refactor harus pakai feeling.

**Total Architecture: 7.5/10**

---

## 6. Code Quality Review

### Naming Convention: 9/10
Konsisten kamel case, file kebab-case. Method name ekspresif (`getRows`, `createRow`, `wouldCauseCycle`). DTO suffix `.dto.ts`. Util suffix `.util.ts`. **Skor mendekati sempurna.**

### Readability: 8/10
- Service method panjang tapi terstruktur dengan komentar pembatas (`// 1.`, `// 2.`).
- Magic numbers diberi konstanta (`DTPS_MAIN_HEADER_ROW`, `MAX_FILE_SIZE`).
- **Catatan:** `imports.service.ts` mencapai 520 LOC — masih readable tapi mendekati batas comfortable.

### Type Safety: 7/10
- `tsconfig.json` strict mode aktif (asumsi dari CLAUDE.md).
- `any` digunakan terbatas: `tx: any` di import (lihat §4.7), `file.buffer as any` (workaround Buffer types), `cell.hyperlink as ... | string`.
- DTO + `class-validator` rapi.
- Interface `ColDef`, `SheetData` (`'dtps' | 'grid'` discriminated union) — bagus.

### Error Handling: 8/10
- Exception class NestJS dipakai konsisten (`UnauthorizedException`, `NotFoundException`, `BadRequestException`, `ConflictException`, `UnprocessableEntityException`).
- File korup → 422 (bukan 500). ✅
- Transaksi rollback di kegagalan apa pun. ✅
- **Minus:** Tidak ada global exception filter yang menyamarkan error 500 (stack trace bisa bocor jika error tak terduga).

### Validation: 9/10
- Global ValidationPipe + DTO. ✅
- `ParseUUIDPipe` di route param. ✅
- Validator nilai per tipe kolom. ✅
- File filter di Multer (`.xlsx` only). ✅
- **Catatan:** UUID format permisif (`@Matches` regex) karena sentinel UUID — sudah dikomentari benar, tapi praktik production akan pakai UUID v4/v7 yang lolos `@IsUUID()`.

### Logging: 4/10
- Hanya `console.log` di startup.
- Prisma query log selalu aktif (lihat §4.6).
- Tidak ada request ID, tidak ada level (debug/info/warn/error), tidak ada output structured (JSON).
- Tidak ada audit log eksternal — semua di tabel `ChangeLog` (bagus, tapi tidak observable real-time).

### Testing Readiness: 3/10
- **Tidak ada test** sama sekali.
- Code SUDAH testable (fungsi murni di validator, DI rapi di service) — siap di-test.
- Belum ada `jest.config.ts`, belum ada e2e setup, belum ada test database.

**Total Code Quality: 6.9/10** (turun oleh logging & testing).

---

## 7. Security Review

### CRITICAL
*Tidak ada temuan critical.* Fix 002g sudah menutup celah paling serius (refresh token broken).

### HIGH

**H1. Query logging Prisma membocorkan data sensitif di production.**
`prisma.service.ts:14` — `log: ['query', 'info', 'warn', 'error']` mencatat seluruh query termasuk parameter (passwordHash bcrypt, refresh tokenHash SHA-256, isi cell NIDN). Jika log di-pipe ke service eksternal, ini adalah pelanggaran data.
**Fix:** kondisional pakai env:
```ts
log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'info', 'warn', 'error']
```

**H2. Tidak ada Global Exception Filter.**
Error tak terduga (mis. constraint DB yang tidak ditangani) akan keluar dengan stack trace default NestJS. Di production = bocoran struktur internal.
**Fix:** Pasang `AllExceptionsFilter` global yang mengembalikan `{ statusCode, message }` saja, dengan stack di-log ke server.

**H3. CORS origin diset dari env tanpa validasi format.**
`main.ts:29` — `origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173'`. Jika seseorang set `CORS_ORIGIN=*`, semua origin diterima dengan credentials. Tidak ada whitelisting.
**Fix:** Validasi env saat boot (`config.validate` schema), tolak `*` saat `credentials: true`.

### MEDIUM

**M1. Refresh token endpoint tidak rate-limit per-user, hanya per-IP.**
`THROTTLE_REFRESH_LIMIT=10 per menit`. Penyerang bisa memutar IP. Idealnya per-user (atau per-refresh-token).

**M2. Tidak ada CSRF protection untuk endpoint cookie-based.**
`POST /auth/refresh` memakai cookie. Untuk frontend SPA same-origin, kondisi `SameSite=lax` cukup. Untuk extension / iframe / cross-origin, perlu CSRF token. Konfirmasi arsitektur frontend Sprint 2.

**M3. `file.originalname` dipakai sebagai workbook name tanpa sanitasi.**
`imports.service.ts:181` — `file.originalname.replace(/\.xlsx$/i, '')` bisa berisi `../`, emoji, atau payload. Disimpan di `MenuItem.name` (String, tidak terbatas). Risk rendah (tidak masuk ke file system path), tapi bisa muncul di UI. Sanitasi sebelum simpan.

**M4. `cell.text` mungkin mengembalikan formula sebagai string.**
ExcelJS: untuk sel formula tanpa cached result, `cell.text` bisa kosong tapi `cell.value.formula` ada. Kebijakan saat ini: kosong = tidak dibuat. Aman, tapi data formula hilang.

### LOW

**L1. Throttler limit terlalu longgar untuk endpoint write.**
`POST /sheets/:id/rows` tidak diberi throttle khusus — terikat pada global `THROTTLE_LIMIT=100/min`. Admin bisa kirim 100 baris/menit; tidak melindungi dari typo loop di klien.

**L2. Tidak ada Content-Security-Policy headers / helmet.**
Untuk API, dampaknya rendah, tapi best practice tetap pasang `helmet()`.

**L3. JWT validate hit DB setiap request.**
`jwt.strategy.ts:30` melakukan `findUnique(User)` setiap request agar `isActive` ter-cek. Trade-off keamanan vs perf. Untuk scale tinggi, cache 30s atau pakai token blacklist.

**L4. `TRUST_PROXY=false` di .env saat ini.**
Saat dipasang di belakang Nginx/Cloudflare dan toggle tidak diaktifkan, IP yang masuk ke throttler adalah IP reverse proxy = throttle global ke semua user. Dokumentasi mengingatkan, tapi mudah lupa.

**L5. Tidak ada audit untuk read-sensitive endpoints.**
`GET /sheets/:id/rows` (yang berisi NIDN) tidak meninggalkan jejak siapa membaca apa. Untuk DTPS minor, tapi untuk data sensitif jangka panjang = perlu access log.

### Yang Sudah Aman (✅)
- SQL Injection: Prisma parameterized — aman.
- XSS: API-only, tidak render HTML — N/A di backend.
- Bcrypt untuk password (cost 12) — sesuai best practice.
- Reuse-detection refresh token (revoke-all-on-reuse).
- Cookie httpOnly + secure (toggle env) + path scoped.
- `forbidNonWhitelisted` di ValidationPipe.
- **Read-only sheet write guard (T7, post-audit):** sheet cermin grid (`isReadOnly:true`) menolak `POST/PATCH/DELETE /sheets/:id/rows` dengan 409. Sebelumnya celah ini terbuka karena endpoint tulis dibuat sebelum flag `isReadOnly` ada di schema.

---

## 8. Performance Review

### Query Efficiency
| Endpoint | Query count | Catatan |
|---|---|---|
| `GET /menus` | 1 | Load seluruh `menu_items` + sheets. Cocok untuk skala < 1000. |
| `GET /sheets/:id/columns` | 2 (sheet check + columns) | Tree-build O(n) in-memory. ✅ |
| `GET /sheets/:id/rows` | 4 (sheet, all columns, count, rows+cells via include) | Anti-N+1 benar. ✅ |
| `POST /sheets/:id/rows` | 1 read + 1 transaksi (4–5 query) | Anti-N+1 via createMany. ✅ |
| `PATCH /sheets/:id/rows/:rowId` | 3 read + 1 transaksi + 1 re-fetch | **Loop per-cell di tx** (lihat di bawah). |
| `DELETE /sheets/:id/rows/:rowId` | 3 + 1 transaksi (2 query) | Cascade dari schema. ✅ |
| `POST /imports` | O(jumlah sheet) di tx | createMany batch. ✅ untuk file besar. |

**Issue di `updateRow`:** loop `for (const cell of dto.cells)` di dalam transaksi melakukan upsert/deleteMany per cell. Jika user kirim 50 perubahan sekaligus = 50 query serial. Optimasi: split menjadi `createMany(skipDuplicates)` + `updateMany` + `deleteMany` dalam 3 batch.

### API Efficiency
- Response sudah `select`-aware (tidak dump field internal). ✅
- Tidak ada caching HTTP (ETag/Last-Modified). Untuk frontend cache-busting akan refetch full.
- Pagination hanya di `/rows`. `/menus` dan `/columns` tidak — masuk akal karena skalanya kecil.

### Caching Opportunities
- **Pohon menu**: kandidat caching kuat. Berubah jarang (CRUD oleh ADMIN). TTL 30s + invalidate-on-write.
- **Pohon kolom**: berubah hanya saat import. Cache aman per `sheetId`.
- **JWT validate user**: cache 30s untuk hindari hit DB per request.

### Bundle / Memory
- Memory upload Multer: `memoryStorage()` dengan limit 10MB. File 100MB akan ditolak dengan 413 (default Multer). OK.
- ExcelJS load seluruh workbook di memory. File 200MB dengan 60 sheet = bisa kena 1GB+ memory peak. Untuk skala produksi, streaming parse + queue.

### Rendering Efficiency
N/A (backend).

---

## 9. Missing Features

### Wajib untuk MVP yang Pantas Dipasangi Frontend

**MF1. User Management (CRUD User)** — *Tinggi*
- Saat ini hanya `admin` + `kaprodi` dari seed. Tidak ada cara menambah user via API.
- **Dampak bisnis:** Akreditasi melibatkan banyak kaprodi dari berbagai prodi. Hardcoded di seed = blocker.
- **Yang perlu:** `POST/PATCH/DELETE /users` ADMIN-only, force-reset-password mechanic.

**MF2. `GET /imports` (Daftar import)** — *Tinggi*
- Tidak ada cara melihat history "siapa import apa kapan". Data sudah masuk DB (`ExcelImport`) tapi tidak ada endpoint baca.
- **Dampak:** Sulit troubleshoot saat data tidak sesuai harapan.

**MF3. Pengiriman `CellMerge` ke Frontend** — *Tinggi (untuk sheet cermin)*
- Sudah disebut di prompt Sprint 1 sebagai "slice berikutnya". Tanpa ini, frontend tidak bisa merender rowspan/colspan untuk sheet read-only.
- **Yang perlu:** `GET /sheets/:id/merges` atau `GET /sheets/:id/rows?includeMerges=true`.

**MF4. CRUD untuk Sheet (manual create tanpa import)** — *Sedang*
- Saat ini sheet hanya bisa lahir dari import. Tidak ada "Sheet baru manual".
- **Dampak:** Sprint 2 punya item ini di backlog CLAUDE.md, tapi flag-nya jelas.

**MF5. Soft Delete + Riwayat Versi (dari `change_logs`)** — *Sedang*
- Hard delete sekarang. `ChangeLog` mencatat snapshot tapi tidak ada `GET /change-logs?entityId=...`.
- **Dampak:** Tidak ada undo. Untuk data akreditasi, ini risiko bisnis.

### Untuk Operasional Production

**MF6. Healthcheck yang Lebih Lengkap** — *Sedang*
- `/health` hanya `SELECT 1`. Tidak cek koneksi pool, tidak cek migrasi up-to-date, tidak cek versi.
- **Yang perlu:** `/health/ready` + `/health/live` (k8s-style).

**MF7. Metrics / Observability** — *Sedang*
- Tidak ada Prometheus endpoint, tidak ada APM hook.
- **Dampak:** Saat masalah produksi, debugging blind.

**MF8. Backup / Export** — *Rendah-Sedang*
- Tidak ada `GET /sheets/:id/export.xlsx` (regenerate file Excel dari DB).
- **Dampak bisnis:** Tim akreditasi mungkin ingin keluarkan file Excel hasil revisi untuk submit ke BAN-PT.

**MF9. Search across cells (pg_trgm)** — *Rendah (Sprint 2 di CLAUDE.md)*

---

## 10. Sprint 2 Recommendations

### High Priority

**HP1. Test Suite + CI Pipeline** (effort: 5–8 hari)
- Setup Jest + supertest untuk e2e.
- Test database (dockerized PostgreSQL).
- Coverage minimum 60% untuk service layer.
- GitHub Actions: lint + tsc + test pada PR.
- **Alasan bisnis:** Saat tim membesar, regresi tidak bisa lagi ditangkap manual curl.
- **Alasan teknis:** Refactor service besar (`SheetsService`, `ImportsService`) tanpa test = roulette.

**HP2. Production Hardening Quick Wins** (effort: 2–3 hari)
- Query log Prisma conditional per env (FIX 3 dari prompt fix-auth-defects).
- Global ExceptionFilter (jangan bocor stack).
- Validate env at boot (`@nestjs/config` + Joi).
- Helmet headers.
- Hapus `test-read` / `test-write` di `auth.controller.ts`.
- Hapus stub module kosong (`CellsModule`, `RowsModule`, `UsersModule`, `ColumnsModule`).
- **Alasan:** Pre-requisite sebelum environment staging dipakai stakeholder.

**HP3. User Management API** (effort: 2–3 hari)
- `POST/PATCH/DELETE /users` (ADMIN).
- Force-reset password flow.
- **Alasan bisnis:** Demo tanpa multi-kaprodi tidak realistis.

**HP4. CRUD Sheet Manual + Konfigurasi Kolom** (effort: 5–7 hari)
- `POST /menus/:id/sheets` (buat sheet di node).
- `POST /sheets/:id/columns` (atur header bertingkat manual).
- Promote sheet cermin → semantik (tetapkan tipe kolom existing).
- **Alasan bisnis:** Sprint 2 di CLAUDE.md eksplisit menyebutkan "admin membuat sheet manual".

**HP5. Soft Delete + Restore + Activity Log** (effort: 3–5 hari)
- Migrasi `Sheet.deletedAt`, `Row.deletedAt`.
- `GET /change-logs?entityId=...` untuk riwayat.
- `POST /sheets/:id/restore` / `POST /rows/:id/restore`.
- **Alasan bisnis:** Risk mitigation untuk data akreditasi.

### Medium Priority

**MP1. Endpoint Daftar Import + Re-import Detection**
- `GET /imports`.
- Hash file → cek `ExcelImport.fileHash` untuk warn duplikat.

**MP2. Endpoint `GET /sheets/:id/merges` (untuk frontend cermin grid)**
- Atau extend `GET /sheets/:id/rows?includeMerges=true`.

**MP3. Refactor `SheetsService` → split**
- `SheetsReadService` (columns + rows + metadata).
- `RowsService` (create/update/delete row) — pindah ke `RowsModule` yang masih kosong.
- Ekstrak `pivotCellsForRow(allColumnIds, cells)` helper.

**MP4. Storage Real untuk Excel File**
- Object storage (S3/MinIO) atau filesystem.
- Update `ExcelImport.storagePath` jadi nullable atau hilangkan placeholder.

**MP5. Cache Layer**
- Redis untuk pohon menu (invalidate on CRUD menu).
- JWT validate cache 30s.

**MP6. Logger Structured (pino)**
- Request ID injection.
- Level filter via env.

### Nice to Have

**NTH1. Search di isi cell (pg_trgm GIN index)** — backlog CLAUDE.md.

**NTH2. Export sheet → Excel** (`GET /sheets/:id/export.xlsx`).

**NTH3. Worker queue (BullMQ) untuk import file besar**
- Saat ini import sinkron, blokir HTTP.
- Worker: 100% async, frontend poll status.

**NTH4. Optimistic Locking untuk Edit Baris**
- Sprint 1 = last-write-wins.
- Saat satu sheet diedit dua admin sekaligus = race.

**NTH5. WebSocket untuk Live Update**
- Multi-admin lihat perubahan real-time.

---

## 11. Refactoring Opportunities

### R1. `SheetsService` (sheets.service.ts, 343 LOC)
- **Masalah:** Service mencampur read (columns/rows/metadata) dan write (create/update/delete row). Sudah ada `RowsModule` kosong tapi tidak dipakai.
- **Dampak:** Akan terus membengkak saat sprint 2 menambah copy/paste row, bulk update, dll. Test isolation jadi sulit.
- **Solusi:**
  - Pindah `createRow/updateRow/deleteRow` ke `RowsService` di `RowsModule`.
  - Pertahankan `SheetsService` untuk metadata + columns + getRows (read).
  - Controller `SheetsController` tetap (route shape sama) tapi inject dua service.

### R2. Duplikasi "Build Cells Map" (3 tempat)
- **File:** `getRows`, `createRow`, `updateRow` di `sheets.service.ts`.
- **Masalah:** Pola sama: ambil `allColumnIds` → init `Record<id, null>` → fill.
- **Dampak:** Bug fix harus disinkronkan di 3 tempat.
- **Solusi:** Helper `buildCellsRecord(allColumnIds: string[], cells: Array<{columnId, value}>): Record<string, string|null>`.

### R3. Stub Module Kosong
- **File:** `cells.module.ts`, `rows.module.ts`, `users.module.ts`, `columns.module.ts`.
- **Masalah:** Deklarasi tanpa isi → noise di `app.module.ts` imports + IDE auto-import salah arah.
- **Solusi:** Hapus, atau isi (sebagian akan terisi di Sprint 2 — `RowsModule`, `UsersModule`).

### R4. Route Uji `test-read` / `test-write` di Auth
- **File:** `auth.controller.ts:59-65`.
- **Masalah:** Sisa scaffold 002d.
- **Solusi:** Hapus 2 method + decorator import-nya.

### R5. `tx: any` di Imports Service
- **File:** `imports.service.ts:418, 477` di `writeDtpsToTx` / `writeGridToTx`.
- **Masalah:** Type safety lemah di blok kritis (penulisan DB).
- **Solusi:** Definisikan helper type `type TxClient = Parameters<typeof prisma.$transaction<unknown>>[0] extends (tx: infer T) => unknown ? T : never;` atau pakai `Prisma.TransactionClient` jika v7 mengekspornya.

### R6. UUID Regex Permisif di DTO
- **File:** `create-row.dto.ts`, `update-row.dto.ts`, `create-menu.dto.ts`, `update-menu.dto.ts`.
- **Masalah:** 4 file mengulang regex UUID + komentar yang sama.
- **Solusi:** Ekstrak ke `src/common/decorators/is-uuid-permissive.ts` — custom decorator atau export shared regex.

### R7. `ImportsService.parseGridSheet` Loop Kuadrat
- **File:** `imports.service.ts:378-387`.
- **Masalah:** `eachRow` lalu loop kolom untuk tiap baris. Untuk sheet 1000×50 = 50k iterasi, plus call `row.getCell(c)` yang internal lookup.
- **Solusi:** Pakai `row.eachCell({ includeEmpty: false }, ...)` yang lebih efisien.

### R8. `console.log` di `main.ts`
- **File:** `main.ts:35`.
- **Solusi:** Hapus atau ganti `Logger` NestJS (`new Logger('Bootstrap').log(...)`).

### R9. Query Logging Prisma (FIX 3 yang tertunda)
- **File:** `prisma.service.ts:14`.
- **Solusi:** Lihat §7 H1.

### R10. Index Tambahan di `refresh_tokens`
- **File:** `prisma/schema.prisma:71`.
- **Solusi:** Tambah `@@index([tokenHash])` (atau composite `[userId, tokenHash]`).

---

## 12. Overall Scorecard

| Aspek | Skor | Justifikasi |
|---|---:|---|
| **Architecture** | **7.5/10** | EAV engine tepat, modul rapi, tapi `SheetsService` membengkak + 4 stub module kosong. |
| **Scalability** | **6/10** | Anti-N+1 disiplin. Tapi tidak ada caching, import single-threaded di event loop, no worker queue. |
| **Maintainability** | **8/10** | Task log lengkap, naming konsisten, validator mandiri. Minus: tidak ada test = refactor pakai feeling. |
| **Security** | **7/10** | Bcrypt + SHA-256 dipakai tepat. Reuse-detection berjalan. Tapi: query log bocor di prod, no global exception filter, CORS tidak divalidasi. |
| **Performance** | **7/10** | Sebagian besar endpoint efisien. `updateRow` loop serial bisa di-batch. No HTTP caching. |
| **Code Quality** | **6.9/10** | Konsisten dan clean, tapi logging primitif & 0 test menarik turun. |
| **Production Readiness** | **5.5/10** | DoD lulus, tapi belum ada test, logging structured, exception filter, env validation, atau hardening. Cocok untuk staging/demo, **belum cocok untuk prod**. |

### Skor Komposit: **6.8/10** — *MVP berkualitas tinggi, perlu pekerjaan Sprint 2 untuk naik ke Beta/Production*.

---

## Closing Note (Honest Critique)

Backend ini **di atas rata-rata untuk Sprint 1**. Disiplin task log, anti-N+1, dan validasi berlapis menunjukkan engineer yang memahami fundamental NestJS dan Postgres. Refactor bcrypt → SHA-256 (002g) adalah momen yang jarang terjadi di proyek yang dibimbing AI — biasanya bug subtle lolos.

**Tapi:** ada tiga gap yang harus jujur dibilang serius:

1. **Tidak ada test sama sekali.** Untuk Sprint 1 = wajar. Untuk Sprint 2 = kewajiban moral. Tanpa ini, semua refactor yang direkomendasikan di §11 berisiko.

2. **Backend ini disetel untuk dev, bukan prod.** Query log bocor, tidak ada exception filter, env tidak divalidasi, no helmet, no structured log. Ini bukan masalah saat hanya dipakai di laptop developer. Ini critical saat staging dipakai stakeholder.

3. **Engine generik membayar harganya saat skala.** EAV bagus untuk fleksibilitas tapi setiap baca/tulis = pivot. Untuk DTPS (24 baris) tidak terasa. Untuk sheet hasil import file 60 sheet × 1000 baris = perlu strategi caching atau materialized view. Sprint 2 harus mulai memikirkan ini.

**Rekomendasi paling impactful untuk Sprint 2 (kalau hanya boleh pilih satu): HP1 (Test Suite + CI).** Semua refactor dan fitur baru lebih murah dengan jaring pengaman test.

---

## Addendum Post-Audit (2026-06-20)

Perubahan setelah audit ditandatangani — dicatat di sini agar skor & temuan tetap dapat dilacak.

### T7 — Read-only write guard (closed gap)
- **Celah yang ditutup:** Endpoint `POST/PATCH/DELETE /sheets/:id/rows` dibuat di slice 3e–3g sebelum kolom `Sheet.isReadOnly` ada (migrasi `add_sheet_isreadonly` baru muncul saat import multi-sheet). Akibatnya, ADMIN masih bisa menulis ke sheet cermin grid (mis. EWMP) yang seharusnya hanya-baca. Audit ini tidak menyorotnya sebagai weakness eksplisit — pelacakan kami yang luput. Sekarang ditutup.
- **Implementasi:** Helper privat `assertWritableSheet(sheetId)` di `SheetsService` — satu titik untuk tiga method tulis. Tidak ada perubahan schema, tidak ada endpoint baru.
- **Kontrak HTTP baru:**
  - Sheet ID tidak ada → 404.
  - Sheet `isReadOnly: true` → **409 Conflict** + pesan "Sheet ini hanya-baca dan tidak bisa diubah".
  - Sheet editable (`isReadOnly: false`) → tetap 200/201 seperti sebelumnya.
  - Urutan kegagalan: KAPRODI → 403 (Guard, sebelum service); ADMIN + read-only → 409 (service).
- **Mengapa 409, bukan 403:** 403 dipakai untuk *"peranmu tidak boleh"* (role). 409 = *"permintaanmu bertabrakan dengan keadaan resource"* (read-only). Frontend dapat menampilkan pesan yang berbeda tanpa parsing body error.
- **File berubah:** `src/sheets/sheets.service.ts` (helper + 3 call site), `docs/tasks/007-readonly-write-guard.md` (task log).
- **Verifikasi:** Tes negatif manual sesuai matriks di task log (sheet EWMP & DTPS, token ADMIN & KAPRODI).

### Catatan untuk Skor Komposit
Closure T7 tidak menggeser skorcard di §12 secara material — ini perbaikan defense-in-depth, bukan kategori baru. Tapi **Security** layak naik 0.2 poin (7.0 → 7.2) karena satu pintu yang sebelumnya terbuka kini tertutup. Tidak diupdate inline agar jejak skor original tetap dapat dirujuk.

### Backlog Terkait (belum dikerjakan)
- Validasi "columnId di body harus milik sheet yang sama" untuk `POST/PATCH /sheets/:id/rows` — mencegah tulis cell dengan kolom dari sheet lain via path palsu. Hardening terpisah, bukan bagian T7.

---

## Addendum Post-Audit #2 (2026-06-27)

Tiga blok pekerjaan masuk **setelah** addendum T7 ditandatangani. Dicatat di sini agar
jejak skor & temuan tetap dapat dilacak. Dua di antaranya menutup **bug korektabilitas yang
luput dari audit asli** — dicatat jujur, sebagaimana T7.

### T5 — DTPS parser: kolom merge-vertikal null (correctness bug, luput dari audit asli)
- **Celah yang ditutup:** Kolom yang header-nya merge **vertikal** (No. `A2:A3`, Nama Dosen
  `B2:B3`, Jabatan Akademik `E2:E3`) menghasilkan **null di semua 24 baris** DTPS. Penyebab:
  `parseDtpsHeaders` memasukkan merge vertikal ke `mergeMap` → kolom diperlakukan sebagai
  *grup tanpa anak* → tersaring keluar dari `leafCols` → Cell tidak pernah dibuat.
- **Catatan jujur:** §1 audit asli menyatakan "Tabel DTPS tampil benar" dan DoD #4 lulus.
  Faktanya tiga kolom kunci kosong. Audit asli **tidak memverifikasi isi baris data DTPS**
  secara sel-per-sel — hanya header & NIDN. Ini gap pelacakan kami, bukan temuan baru yang
  muncul belakangan.
- **Fix:** satu guard `if (endCol <= startCol) continue;` di `parseDtpsHeaders`
  (`imports.service.ts:310`) — merge vertikal diabaikan, kolom diperlakukan sebagai leaf biasa.
- **File:** `src/imports/imports.service.ts`, `docs/tasks/005-fix-dtps-parser.md`.

### T8 — Grid-mirror import: sel formula & ekspos `CellMerge`
Menutup **dua** item sekaligus: satu bug korektabilitas (Bug B) dan satu Missing Feature (Bug A).

- **Bug B — `[object Object]` di sel formula (closes §7 M4, plus data-corruption yang luput).**
  `getCellText` lama menjalankan `String(cell.value)` pada sel formula tanpa cached result.
  `cell.value` adalah objek `{ formula, result }` → tersimpan literal `"[object Object]"` di DB
  (mis. kolom "Rata-rata" AVERAGE pada sheet "20. Pembimbing TA"). Audit asli §7 M4 hanya
  menandai "data formula hilang (aman)" — **meremehkan**; kenyataannya nilai sampah tersimpan
  permanen dan melanggar kontrak FE `cell: string | null`. Fix (`imports.service.ts:84-101`):
  tangani `ValueType.Formula` eksplisit, baca `.result`, hormati `numFmt` via `cell.text`
  (mis. `8,7` bukan `8.666…`), dan guard anti-stringify objek di fallback. Berlaku untuk jalur
  DTPS **dan** grid-mirror.
- **Bug A — ekspos `CellMerge` (closes §9 MF3 "High" + §10 MP2).**
  Data merge sudah ditulis ke tabel `CellMerge` saat import tapi tidak pernah dikembalikan API,
  sehingga frontend tak bisa merender rowspan/colspan sheet read-only. Sekarang `findById`
  (`sheets.service.ts:339-348`) menyertakan `merges` **hanya** untuk sheet `isReadOnly: true`.
- **Normalisasi koordinat (keputusan kunci):** ExcelJS melaporkan merge dalam koordinat Excel
  **absolut**, sedangkan `Row/Column.orderIndex` ditulis **relatif** (1-based). Normalisasi
  dilakukan **saat write** di `writeGridToTx` (`imports.service.ts:534-544`:
  `startRow - firstRow + 1`, dst.) — `firstRow/firstCol` tersedia di sana tanpa menyimpan
  metadata ekstra. Konsumen FE menerima koordinat yang langsung selaras grid.
- **Konsekuensi data:** baris lama yang menyimpan `"[object Object]"` atau koordinat absolut
  **wajib di-import ulang** — fix kode tidak menyentuh row yang sudah ada.
- **File:** `src/imports/imports.service.ts`, `src/sheets/sheets.service.ts`,
  `docs/tasks/008-fix-grid-mirror-import.md`.

### Swagger / OpenAPI (developer experience)
- `@nestjs/swagger` dipasang di `main.ts` (`/api/docs`, `persistAuthorization`, bearer auth) +
  dekorator `@ApiTags/@ApiOperation/@ApiResponse` di controller **Auth, Imports, Menus, Sheets**
  (21 anotasi di 4 file). API kini self-documenting; alur "login → Authorize → coba endpoint"
  terdokumentasi inline.
- **Sisa:** `HealthController` belum diberi tag (minor). Belum ada skema DTO response eksplisit
  untuk beberapa endpoint (pakai `example` inline, bukan `@ApiOkResponse({ type })`).

### Yang MASIH terbuka (re-verifikasi 2026-06-27 — tidak berubah sejak audit asli)
Tidak ada satu pun dari gap struktural utama yang tersentuh:

| Ref | Temuan | Status |
|---|---|---|
| §4.1 / Testing 3/10 | **0 file `.spec.ts`** | ❌ Masih nol — diverifikasi |
| §4.2 / R3 | Stub module kosong (`cells`, `columns`, `rows`, `users`) | ❌ Masih ada |
| §4.3 / R8 | `console.log` di `main.ts` | ❌ Masih ada (`main.ts:50-51`) |
| §4.4 / R4 | Route uji `test-read` / `test-write` | ❌ **Masih ada** (`auth.controller.ts:83-97`) — kini malah ter-dokumentasi Swagger |
| §4.6 / §7 H1 / R9 | Query log Prisma tak-kondisional | ❌ Masih `['query','info','warn','error']` (`prisma.service.ts:14`) |
| §4.7 / R5 | `tx: any` di import | ❌ Masih ada (`imports.service.ts:437,493`) |
| §4.16 | Import `BadRequestException` di imports | ⚠️ Audit asli menandai "sudah diperbaiki" — **keliru**; import masih ada & tak terpakai (`imports.service.ts:2`) |
| §7 H2 | Global exception filter | ❌ Belum ada |
| §7 H3 | Validasi env saat boot | ❌ Belum ada |

### Dampak ke Skor Komposit
Perubahan ini **korektabilitas + satu Missing Feature + dokumentasi** — bukan gap struktural
(test, hardening prod) yang menahan skor. Penyesuaian (tidak diedit inline, agar jejak asli utuh):

- **Code Quality** §6: +0.2 (6.9 → 7.1). Bug `[object Object]` adalah cacat integritas data nyata;
  penanganan formula kini benar & defensif. Tapi Logging (4/10) & Testing (3/10) tak bergerak.
- **Production Readiness** §12: tetap **5.5/10**. Tidak ada yang berubah di sumbu prod-readiness
  (test, exception filter, env validation, structured log, query-log hardening semua masih terbuka).
- **Missing Features** §9: MF3 (ekspos `CellMerge`, "High") → **closed**. MF1/MF2/MF4/MF5 tetap.
- **Verdict satu kalimat tidak berubah:** layak demo & dipasangi frontend; **belum** layak
  tinggalkan dev tanpa test suite + hardening.

**Rekomendasi tunggal paling impactful tetap HP1 (Test Suite + CI).** Dua fix di addendum ini
(merge-vertikal & `[object Object]`) keduanya bug yang **akan tertangkap unit test** atas
`getCellText` / `parseDtpsHeaders` sebelum sampai produksi — bukti konkret kenapa §10 HP1 prioritas satu.

---

*Dokumen ini ditandatangani sebagai bagian dari review formal Sprint 1. Patuhi atau debat poin per poin — jangan lewati diam-diam.*
