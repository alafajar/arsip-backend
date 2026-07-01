# Audit Sprint 2 — Sistem Dokumentasi & Arsip Akreditasi (Backend)

**Tanggal Audit:** 2026-06-30
**Auditor:** Staff Software Engineer / Solution Architect Review
**Cakupan:** Backend NestJS 11 + Prisma 7 + PostgreSQL 17 (Sprint 2 deliverables: task 011–022)
**Total source files:** 44 file `.ts` di `src/` (~3,276 LOC)
**Baseline:** lihat `audit-sprint-1.md` (skor komposit 6.8/10, MVP akhir Sprint 1)

---

## 1. Executive Summary

### Kondisi Saat Ini
Sprint 2 menambahkan **lapisan "engine tabel yang dapat dikonfigurasi"** di atas fondasi Sprint 1.
Yang dulu hanya bisa dibaca dan diisi barisnya, kini bisa **dibentuk dari nol lewat API**:
buat sheet kosong (`POST /sheets`), atur kolom bertingkat (`POST/PATCH/DELETE columns`),
definisikan kolom formula horizontal (antar-kolom, per-baris) dengan validasi siklus & tipe,
dan agregat vertikal (footer total kolom). Ditambah dua fitur baca yang menyalakan UI:
breadcrumb (`GET /menus/:id/path`) dan filter faceted multi-nilai (`GET /sheets/:id/rows?filter[...]`).

Tiga keputusan terkunci (K1 breadcrumb tanpa reparent, K2 filter exact-match, K3 agregat
tingkat-sheet computed-on-read) **dipatuhi konsisten** — tidak ada penyimpangan diam-diam.
Dua slice (012 import opsi-B, 022 formula Excel) adalah **verifikasi murni** dengan bukti runtime,
dan slice 022 jujur melaporkan satu temuan (formula tanggal dari file programatik) alih-alih
menambalnya diam-diam.

Disiplin Sprint 1 **bertahan**: 12 task log baru mengikuti format yang sama (Tujuan → Rencana →
File diubah → Keputusan kunci → Belajar dari sini), pola guardrail C (validasi → transaksi → audit)
diterapkan di setiap endpoint tulis baru, dan tabel hasil tes negatif (401/403/404/400/409)
terlampir di setiap slice.

### Tingkat Kematangan: **MVP+ (engine konfigurabel, masih pra-Beta)**

| Tahap | Status | Catatan |
|---|---|---|
| Prototype | ✅ Lewat | — |
| MVP (Sprint 1) | ✅ Lewat | DoD #1–#5 lulus |
| **MVP+ (Sprint 2)** | ✅ **Sedang di sini** | Sheet/kolom/formula/agregat dapat dikonfigurasi via API |
| Beta | ❌ Belum | **Masih 0 test**, no structured log, no env validation, no exception filter |
| Production Ready | ❌ Belum | Gap hardening Sprint 1 belum satu pun tersentuh |

**Verdict satu kalimat:** *Sprint 2 memperluas kapabilitas produk secara substansial dan tetap
disiplin di level slice — tapi tidak menggerakkan satu pun jarum "production readiness" dari Sprint 1;
seluruh hutang teknis (0 test, query-log bocor, no exception filter, SheetsService membengkak)
masih utuh, dan sebagian malah memburuk.*

---

## 2. What Has Been Built (Sprint 2)

### 2.1 Navigasi & Baca
| Fitur | Endpoint | Slice | Value |
|---|---|---|---|
| Breadcrumb jalur ancestor | `GET /menus/:id/path` | 011 | Frontend render "Kriteria > DTPS" yang dapat diklik |
| Nilai unik per kolom | `GET /sheets/:id/columns/:columnId/values` | 013 | Mengisi opsi filter multi-select (maks 200, `GROUP BY` di DB) |
| Filter faceted multi-nilai | `GET /sheets/:id/rows?filter[col][]=v` | 015 | OR dalam kolom, AND antar-kolom, exact match (K2), `EXISTS` di DB |

### 2.2 Konfigurasi Tabel (engine baru)
| Fitur | Endpoint | Slice |
|---|---|---|
| Buat sheet kosong | `POST /sheets` (ADMIN) | 016 |
| Tambah kolom (daun/grup/anak) | `POST /sheets/:id/columns` (ADMIN) | 017 |
| Ubah nama/urutan kolom | `PATCH /columns/:id` (ADMIN) | 017 |
| Hapus kolom + cell (cascade) | `DELETE /columns/:id` (ADMIN, grup berisi anak → 400) | 017 |

### 2.3 Kolom Formula Horizontal (antar-kolom, per-baris)
| Aspek | Detail | Slice |
|---|---|---|
| Skema | `Column.formulaOp: FormulaOp?` + `formulaOperandIds: String[]` + migrasi | 018 |
| Hitung saat read | `GET /sheets/:id/rows` mengisi nilai formula (tidak disimpan) | 019 |
| Tolak tulis ke kolom formula | `createRow`/`updateRow` → 400 | 019 |
| Validasi definisi | operand ada di sheet, tipe numerik (kecuali COUNT), no self-ref, **deteksi siklus (DFS)** | 020 |
| 9 operasi | ADD, SUB, MUL, DIV, SUM, AVERAGE, COUNT, MAX, MIN | 018–020 |

### 2.4 Agregat Vertikal (footer total kolom) — slice 021
| Aspek | Detail |
|---|---|
| Skema | enum `AggregateOp` (SUM/AVERAGE/COUNT/MAX/MIN) + model `SheetAggregate {sheetId, targetColumnId, op}` + migrasi |
| CRUD | `POST` / `GET` / `DELETE /sheets/:id/aggregates` (mutasi ADMIN-only) |
| Hitung saat read | nilai dikembalikan sebagai `aggregates: [{id, columnId, op, value}]` di `GET /rows` **dan** endpoint GET khusus |
| Validasi | kolom milik sheet, kolom daun, op numerik → INTEGER/FLOAT, COUNT bebas tipe, unique `(sheetId, targetColumnId, op)` |
| Skop hitung | seluruh baris (bukan hanya halaman aktif) |

### 2.5 Verifikasi (tanpa kode produk)
| Slice | Apa yang diverifikasi | Hasil |
|---|---|---|
| 012 | `POST /imports` opsi-B: folder dari nama file, sheet jadi anak | ✅ Sesuai spec, tanpa bug |
| 022 | Sel rumus Excel → nilai statis di `GET /rows` | ✅ 8/9 kasus; 1 temuan (formula tanggal dari file programatik) |

### 2.6 Infrastruktur / Perubahan Lintas
- 2 migrasi baru: `add_formula_fields`, `add_sheet_aggregate` (total 5 migrasi terlacak).
- Modul baru: `AggregatesModule`; `ColumnsModule` yang dulu stub kini terisi penuh.
- `main.ts`: `app.set('query parser', 'extended')` — fix regresi Express 5 untuk bracket-array qs.
- Swagger anotasi diperluas ke endpoint Columns & Aggregates.

---

## 3. Strengths

### 3.1 Disiplin Slice Bertahan di Sprint 2
12 task log baru, format identik dengan Sprint 1. Setiap slice punya tabel tes negatif yang
terverifikasi manual. Untuk proyek yang dibimbing AI, konsistensi ini langka dan bernilai tinggi —
histori keputusan dapat dilacak per fitur.

### 3.2 Dua Slice Verifikasi yang Jujur (012, 022)
Slice 012 dan 022 tidak menulis kode produk — mereka **membuktikan** perilaku dengan bukti runtime
(query log, respons HTTP). Slice 022 menemukan formula tanggal menghasilkan string timezone JS,
dan **melaporkannya sebagai TEMUAN** (T-1) dengan analisis penyebab + skop dampak, alih-alih
menambal diam-diam. Ini persis perilaku yang diminta CLAUDE.md ("dokumentasikan sebagai TEMUAN,
jangan diam-diam patch tanpa lapor"). Disiplin intelektual yang benar.

### 3.3 Validasi Formula Berlapis dengan Satu Query (slice 020)
`validateFormulaDefinition` melakukan SEMUA cek — operand ada di sheet, tipe numerik, self-reference,
**deteksi siklus DFS iteratif (O(V+E))** — dalam satu `findMany({ where: { sheetId } })`.
Tidak ada N round-trip per operand. DFS iteratif (stack array, bukan rekursi) tidak akan kena
stack overflow. Pesan error actionable (`"Operand 'Teks' bertipe TEXT — operasi SUM hanya
mendukung INTEGER atau FLOAT"`) — frontend tinggal tampilkan.

### 3.4 Filter Faceted Dieksekusi di DB, Bukan Memori (slice 015)
`cells: { some: { columnId, value: { in: [...] } } }` diterjemahkan Prisma ke `EXISTS (...)`
per kolom — bukti SQL terlampir di task log. OR-dalam-kolom & AND-antar-kolom dipetakan ke
subquery terpisah yang PostgreSQL bisa optimalkan dengan index `(columnId, value, rowId)`.
Validasi columnId filter memakai set yang sudah di-fetch untuk pivot — **nol query tambahan**.

### 3.5 Keputusan Terkunci (K1/K2/K3) Dipatuhi Tanpa Drift
- **K1**: breadcrumb via endpoint, tanpa root fisik, tanpa migrasi reparent. ✅
- **K2**: filter exact-match (`value: { in }`), bukan contains/trgm. ✅
- **K3**: agregat = entitas tingkat-sheet, computed-on-read, dikembalikan sebagai footer terpisah —
  **bukan** baris data. ✅
Tidak ada slice yang menyimpang dari kontrak yang dikunci di INDEX.md.

### 3.6 Pola Computed-on-Read yang Konsisten (formula & agregat)
Baik formula horizontal (019) maupun agregat vertikal (021) **tidak menyimpan** nilai hasil ke
`cells` — dihitung ulang saat `GET /rows`. Konsekuensinya: nilai selalu akurat, tidak ada stale
data, tidak ada sinkronisasi. Terbukti responsif: tes slice 021 menunjukkan SUM 6 → 16 setelah
satu baris ditambah. Trade-off CPU per request diterima eksplisit dan didokumentasikan.

### 3.7 Guardrail C Diterapkan Seragam di Endpoint Tulis Baru
`createSheet`, `createColumn`, `updateColumn`, `deleteColumn`, `createAggregate`, `deleteAggregate`
semua: cek `assertWritableSheet` (atau menu/kolom) → validasi fail-fast → `$transaction` (tulis +
ChangeLog). Tidak ada penulisan setengah jadi. `assertWritableSheet` diduplikasi sebagai helper
privat di tiga service (sheets, columns, aggregates) — konsisten meski belum di-share (lihat §4).

### 3.8 Unique Constraint untuk Agregat (slice 021)
`@@unique([sheetId, targetColumnId, op])` mencegah duplikat definisi di level DB, dengan penanganan
`P2002 → 409` di service. Validasi tidak hanya di aplikasi tapi dijamin DB — benar.

### 3.9 Fix Regresi Express 5 yang Didiagnosis Benar (slice 015)
Express 5 mengganti default query parser dari `qs` (`extended`) ke `simple` (URLSearchParams),
memecah bracket-array `filter[uuid][]=val` tanpa compile error. Didiagnosis tepat dan diperbaiki
dengan satu baris `app.set('query parser', 'extended')`. Bug "senyap saat upgrade major" yang
mudah lolos — tertangkap dan didokumentasikan dengan pelajaran.

---

## 4. Weaknesses

### 4.1 Masih 0 Test — Sekarang Berisiko Tinggi (CRITICAL, carried + memburuk)
**0 file `.spec.ts`/`.test.ts`** — tidak bergerak sejak Sprint 1. Tapi Sprint 2 menambah logika
yang **justru paling pantas di-test unit**: `computeFormula` (9 operasi + edge case null/non-angka/
div-by-zero), `computeVerticalAggregate` (5 operasi), `validateFormulaDefinition` (DFS siklus).
Ini fungsi murni — mudah di-test, berisiko tinggi bila salah. Bug formula tanggal (T-1 slice 022)
adalah **bukti konkret**: unit test atas `getCellText` akan menangkapnya sebelum runtime.
Audit Sprint 1 menyebut HP1 (test suite) sebagai "rekomendasi tunggal paling impactful" — Sprint 2
mengabaikannya dan menambah 3 fungsi kompleks tanpa jaring pengaman.

### 4.2 `SheetsService` Membengkak dari 343 → 581 LOC (carried §4.5/R1, MEMBURUK)
Audit Sprint 1 sudah menandai service ini mencampur read & write dan merekomendasikan split ke
`RowsModule` (yang masih kosong). Sprint 2 **menambah** ke dalamnya: `computeFormula` (45 LOC),
`getColumnValues`, `createSheet`, blok kompute agregat di `getRows`. Service kini 581 LOC, 10+ method,
mencampur: read columns/rows/values, filter, create sheet, create/update/delete row, formula compute,
aggregate compute. `RowsModule` masih `@Module({})` kosong. Hutang ini bukan hanya tak dibayar —
ia tumbuh.

### 4.3 Logika Fetch-and-Compute Agregat Terduplikasi (NEW)
Blok "fetch cells per kolom unik via `Promise.all` → `computeVerticalAggregate`" ada **dua kali**:
di `AggregatesService.getAggregates` (sumber) **dan** disalin ke `SheetsService.getRows`
(`sheets.service.ts`). `SheetsService` meng-import `computeVerticalAggregate` dari `AggregatesService`
tapi **menduplikasi orkestrasi fetch-nya**, bukan memanggil method service. Bug fix harus
disinkronkan di dua tempat. Seharusnya: `getRows` memanggil `aggregatesService.getAggregates(sheetId)`
(inject), atau ekstrak `computeAggregatesForSheet` ke satu tempat.

### 4.4 Helper Numerik (`toNum`, `fmt`) Diduplikasi Lintas File (NEW)
`toNum()` dan `fmt()` muncul identik di `sheets.service.ts` (untuk `computeFormula`) **dan**
`aggregates.service.ts` (untuk `computeVerticalAggregate`). Dua definisi fungsi murni yang sama persis.
Kandidat ekstrak ke `src/common/number.util.ts`. Bila aturan format angka berubah (mis. pembulatan),
harus diubah di dua tempat — tepat jenis bug yang sulit dilacak.

### 4.5 Arah Dependensi Terbalik: `SheetsService` → `AggregatesService` (NEW)
`SheetsService` meng-import dari `AggregatesService`. Secara domain, "sheet" adalah konsep yang lebih
fundamental daripada "aggregate"; idealnya aggregate bergantung pada sheet, bukan sebaliknya.
Saat ini hanya import fungsi murni (`computeVerticalAggregate`) sehingga belum jadi circular dependency,
tapi ini sinyal bahwa logika kompute agregat berada di tempat yang salah. Ekstrak fungsi murni ke
`src/common/` menyelesaikan masalah arah sekaligus duplikasi (§4.3/§4.4).

### 4.6 Seluruh Gap Hardening Production Sprint 1 Masih Utuh (carried, CRITICAL untuk Beta)
Diverifikasi 2026-06-30 — tidak satu pun bergerak:

| Ref Sprint 1 | Temuan | Status 2026-06-30 |
|---|---|---|
| §7 H1 / R9 | Query log Prisma tak-kondisional | ❌ Masih `['query','info','warn','error']` (`prisma.service.ts:14`) |
| §7 H2 | Global exception filter | ❌ Belum ada |
| §7 H3 | Validasi env saat boot | ❌ Belum ada |
| §4.3 / R8 | `console.log` di `main.ts` | ❌ Masih ada (kini 2 baris: port + swagger) |
| §4.4 / R4 | Route uji `test-read`/`test-write` di auth | ❌ Masih ada (`auth.controller.ts:83,91`) |
| §4.7 / R5 | `tx: any` di imports | ❌ Masih 2 occurrence |
| §4.2 / R3 | Stub module kosong | ⚠️ Sebagian: `columns` kini terisi; `cells`/`rows`/`users` masih kosong |

Sprint 2 adalah sprint fitur murni. Itu pilihan sah — tapi artinya "production readiness" tidak naik
satu milimeter, dan utang ini akan makin mahal dibayar seiring permukaan API membesar.

### 4.7 Agregat & Formula Membaca SELURUH Kolom ke Memori Tiap Read (NEW, perf)
`getAggregates` dan blok agregat di `getRows` melakukan `cell.findMany({ where: { columnId } })`
**tanpa batas** — memuat seluruh nilai kolom ke memori aplikasi setiap request, lalu hitung di JS.
Untuk DTPS (24 baris) tak terasa. Untuk sheet hasil import 1000+ baris dengan beberapa agregat,
tiap `GET /rows` menarik ribuan baris cell ke memori hanya untuk menghitung SUM. Agregat numerik
(SUM/AVG/MAX/MIN/COUNT) **idealnya didorong ke SQL** (`prisma.cell.aggregate` / `groupBy` dengan cast),
bukan dihitung di JS. Computed-on-read benar secara semantik (K3), tapi implementasinya belum scalable.

### 4.8 N+1 Ringan di Kompute Agregat (NEW)
`getAggregates` melakukan satu `findMany` **per kolom unik** via `Promise.all`. Untuk sheet dengan
banyak agregat di kolom berbeda, ini N query paralel. Bisa disatukan menjadi satu
`findMany({ where: { columnId: { in: uniqueColIds } }, select: { columnId, value } })` lalu grup
di memori — pola pivot yang sudah dipakai di `getRows`. Konsistensi anti-N+1 Sprint 1 sedikit kendur di sini.

### 4.9 Validasi UUID Permisif Diduplikasi Lagi (carried §4.13/R6)
`const UUID_RE = /^[0-9a-f]{8}-.../i` kini muncul di DTO: create-sheet, create-column, update-column,
create-aggregate, create-row, update-row, menu. 7+ file mengulang regex + komentar yang sama.
Audit Sprint 1 sudah merekomendasikan ekstrak ke custom decorator `@IsUuidPermissive()`. Sprint 2
menambah dua occurrence baru (column, aggregate) alih-alih mengekstrak.

### 4.10 `createAggregate`/`deleteAggregate` Tidak Menulis ChangeLog (NEW, inkonsistensi audit)
Setiap mutasi lain di proyek (sheet, kolom, baris, import) menulis `ChangeLog` dalam transaksi.
Tapi `AggregatesService.createAggregate` dan `deleteAggregate` **tidak** — hanya `prisma.sheetAggregate.create/delete`
langsung, tanpa entri audit dan tanpa `$transaction`. Prompt slice 021 eksplisit meminta "audit".
Ini gap kepatuhan: definisi agregat dapat dibuat/dihapus tanpa jejak siapa-kapan, memecah pola
guardrail C yang konsisten di seluruh proyek.

### 4.11 Verifikasi Slice 017 N8 (readonly→409) Tidak Dijalankan (minor)
Task log 017 menandai tes N8 (POST kolom di sheet readonly → 409) sebagai "(logic verified)" —
diasumsikan benar karena memakai `assertWritableSheet` yang sama, **bukan** dieksekusi. Untuk slice
021 tes ini benar-benar dijalankan (✅). Inkonsistensi cakupan tes manual antar-slice; idealnya
setiap kontrak HTTP diverifikasi nyata, bukan diasumsikan dari kesamaan kode.

### 4.12 `cell.findMany` Agregat Tanpa `orderBy` Deterministik (minor)
Di `getRows`, blok agregat memanggil `findMany({ where: { columnId } })` tanpa `orderBy`. Untuk
SUM/COUNT/AVG/MAX/MIN urutan tidak penting (komutatif), jadi **tidak ada bug** — tapi `getAggregates`
versi service memakai `orderBy: { rowId: 'asc' }` sedangkan versi `getRows` tidak. Inkonsistensi
kecil yang memperkuat argumen §4.3 (satu sumber kebenaran).

---

## 5. Architecture Review

### Folder Structure: 7.5/10 (turun 0.5 dari 8.0)
```
src/
  auth/        ✅ Lengkap, stabil sejak Sprint 1
  columns/     ✅ Kini terisi penuh (service+controller+2 DTO) — bukan lagi stub
  aggregates/  ✅ Modul baru, struktur bersih (service+controller+DTO)
  sheets/      ❌ Service 581 LOC — membengkak lebih jauh, RowsModule kosong tak dipakai
  menu/        ✅ Bersih, +getPath
  imports/     ✅ Stabil (tx: any masih ada)
  prisma/health/ ✅ Minimal
  cells/ rows/ users/  ❌ Masih stub kosong (lihat §4.6)
```
**Plus:** dua modul baru mengikuti pattern NestJS benar; `columns` lulus dari stub.
**Minus:** `sheets/` makin berat; 3 stub kosong masih menyesatkan; skor turun karena hutang §4.2
Sprint 1 hanya sebagian ditebus sambil yang lain memburuk.

### Separation of Concerns: 7/10 (turun 1.0)
`SheetsService` kini mencampur read (columns/rows/values/filter), write (create sheet/row),
**dan** kompute (formula + agregat). Logika kompute agregat bahkan bocor lintas modul (§4.5).
Controller tetap tipis (baik), tapi service layer kehilangan fokus. Skor turun karena Sprint 2
memperdalam pencampuran tanggung jawab yang sudah ditandai di Sprint 1.

### Modularitas: 7/10 (tetap)
`AggregatesModule` meng-`export` service-nya (siap di-inject) — bagus. Tapi `SheetsService`
men-duplikasi logika agregat alih-alih meng-inject `AggregatesService`, jadi modularitas yang
tersedia tidak dimanfaatkan. 3 stub kosong tetap dideklarasikan di `app.module.ts`.

### Reusability: 6.5/10 (turun 1.5)
Regresi nyata di Sprint 2: `toNum`/`fmt` (§4.4) dan blok fetch-agregat (§4.3) diduplikasi alih-alih
di-share; `UUID_RE` ditambah 2 occurrence (§4.9). `assertWritableSheet` ada 3 salinan privat.
`computeVerticalAggregate` di-export (baik) tapi orkestrasinya tetap disalin. Pola "tulis ulang
daripada ekstrak" muncul berulang — kebalikan dari arah yang diinginkan.

### Scalability: 5.5/10 (turun 0.5)
Computed-on-read benar secara semantik tapi **menambah beban baca**: tiap `GET /rows` kini juga
memuat seluruh kolom teragregasi ke memori dan menghitung di JS (§4.7). Model EAV Sprint 1 sudah
"pivot tiap baca"; Sprint 2 menambah "muat-penuh-kolom tiap baca" untuk agregat. Belum ada caching,
belum ada push-down ke SQL. Untuk 24 baris OK; untuk sheet impor besar = titik tekan baru.

### Maintainability: 7.5/10 (turun 0.5)
Task log tetap lengkap dan berkualitas — kekuatan utama bertahan. Tapi duplikasi baru (§4.3/4.4/4.9)
menambah titik yang harus disinkronkan manual, dan **masih tanpa test** berarti setiap refactor
yang direkomendasikan di §11 tetap "pakai feeling". Skor turun tipis karena permukaan kode tumbuh
lebih cepat daripada infrastruktur yang menjaganya.

**Total Architecture: 6.8/10** (turun dari 7.5 — fitur bertambah, struktur sedikit mundur).

---

## 6. Code Quality Review

### Naming Convention: 9/10 (tetap)
Konsisten. `computeFormula`, `computeVerticalAggregate`, `validateFormulaDefinition`,
`normalizeFacets`, `getPath`, `getColumnValues` — ekspresif. DTO/util suffix dipatuhi.

### Readability: 8/10 (tetap)
Method baru terstruktur dengan komentar pembatas bernomor dan komentar WHY (mis. kenapa dua map
terpisah di `writeDtpsToTx`, kenapa DFS hanya saat UPDATE). `computeFormula` switch-case jelas.
Catatan: `sheets.service.ts` 581 LOC mulai sulit dinavigasi dalam satu layar.

### Type Safety: 7/10 (tetap)
DTO + class-validator rapi. Discriminated union (`FormulaEntry`, `SheetData`) dipakai benar.
`any` terbatas: `tx: any` (imports, carried), `as any` di query-parser fix (main.ts), cast `P2002`
error (`err as { code?: string }` — wajar tanpa tipe Prisma error yang diekspos). Tidak ada regresi.

### Error Handling: 8/10 (tetap)
Exception class dipakai tepat: 400 (payload/tipe salah), 403 (role), 404 (tidak ada), 409
(readonly / duplikat agregat). Distingsi 400-vs-409 untuk "formula write" vs "readonly state"
dipikirkan benar (task 019). **Minus tetap:** belum ada global exception filter (§4.6) — error
tak terduga masih bisa bocorkan stack.

### Validation: 9/10 (tetap)
Validasi formula (slice 020) adalah highlight: berlapis, satu query, pesan actionable. Agregat
memvalidasi kolom-daun + tipe + unique. **Minus:** `@IsEnum` di DTO agregat sudah benar, tapi
`UUID_RE` permisif tetap diduplikasi (§4.9, kualitas-pola bukan kualitas-validasi).

### Logging: 4/10 (tetap)
Tidak bergerak. `console.log` di startup, query log Prisma tetap bocor semua parameter (kini juga
mencatat nilai cell formula & agregat). Tidak ada request ID, level, atau output terstruktur.

### Testing Readiness: 3/10 (tetap, tapi taruhan naik)
Masih 0 test. Kode makin testable (lebih banyak fungsi murni: `computeFormula`,
`computeVerticalAggregate`) tapi makin banyak pula yang **tidak** ditest. Readiness sama, eksposur naik.

### Audit Consistency: NEW catatan
Pola "tulis ChangeLog dalam transaksi" dipatuhi di sheet/kolom/baris **tapi dilewati di agregat**
(§4.10). Ini menurunkan konsistensi audit yang di Sprint 1 jadi kekuatan.

**Total Code Quality: 6.7/10** (turun tipis dari 6.9 — duplikasi & gap audit agregat menarik turun;
logging & testing tetap menahan).

---

## 7. Security Review

### CRITICAL
*Tidak ada temuan critical baru.* Permukaan tulis baru (sheet/kolom/formula/agregat) seluruhnya
`@Roles(Role.ADMIN)` + `assertWritableSheet`. Pola otorisasi server-side Sprint 1 dipertahankan.

### HIGH (seluruhnya carried dari Sprint 1 — belum disentuh)
- **H1. Query log Prisma bocor di prod** (`prisma.service.ts:14`) — kini juga mencatat nilai cell
  yang masuk formula/agregat (potensi NIDN, dll). Belum dikondisikan per `NODE_ENV`.
- **H2. Tidak ada Global Exception Filter** — error tak tertangani (mis. constraint DB di luar P2002
  yang sudah ditangani agregat) masih berpotensi bocorkan stack default NestJS.
- **H3. CORS origin dari env tanpa validasi** — `CORS_ORIGIN=*` masih diterima dengan credentials.

### MEDIUM
- **M1 (NEW). Agregat/formula compute = vektor DoS ringan.** `GET /rows` pada sheet besar memuat
  seluruh kolom teragregasi ke memori (§4.7). Tanpa rate-limit khusus read + tanpa batas ukuran,
  request berulang ke sheet besar bisa menekan memori. Risk rendah saat ini (data kecil), naik
  seiring import besar.
- **M2 (carried). Tidak ada CSRF untuk endpoint cookie-based** (`/auth/refresh`) — bergantung arsitektur FE.
- **M3 (carried). `file.originalname` tanpa sanitasi** → `MenuItem.name`. Slice 012 mengonfirmasi
  folder dibuat dari nama file; nama file berisi `../`/emoji/payload tetap masuk tanpa sanitasi.
- **M4 (carried, sebagian ditutup di addendum Sprint 1).** Sel formula Excel kini ditangani benar
  (slice 022 verifikasi); `[object Object]` sudah tidak terjadi. Sisa: formula tanggal programatik (T-1).

### LOW
- **L1 (carried). Throttler global longgar untuk write.** Endpoint config baru (POST columns/aggregates)
  terikat limit global 100/menit, tanpa throttle khusus.
- **L2 (carried). No helmet / CSP headers.**
- **L3 (carried). JWT validate hit DB tiap request.**
- **L4 (NEW). Agregat tanpa audit (§4.10)** = celah akuntabilitas: tidak ada jejak siapa membuat/
  menghapus definisi agregat. Bukan kerentanan teknis, tapi kelemahan governance untuk data akreditasi.

### Yang Sudah Aman (✅)
- Prisma parameterized (SQL injection aman) — termasuk filter `in` dan kompute baru.
- Otorisasi server-side di semua mutasi config baru (ADMIN-only).
- `assertWritableSheet` (409) konsisten di sheets, columns, aggregates.
- Unique constraint DB untuk agregat (defense-in-depth, bukan hanya cek aplikasi).
- `forbidNonWhitelisted` ValidationPipe global tetap aktif — field asing 400.

**Catatan skor:** tidak ada perbaikan keamanan dan tidak ada regresi keamanan substansial; satu
gap governance baru (L4) muncul. Security tetap **7/10** (sama dengan baseline pra-addendum Sprint 1).

---

## 8. Performance Review

### Query Efficiency (endpoint Sprint 2)
| Endpoint | Query | Catatan |
|---|---|---|
| `GET /menus/:id/path` | 1 | Load semua `(id,name,parentId)`, traversal memori O(depth). ✅ Anti-N+1. |
| `GET /sheets/:id/columns/:columnId/values` | 2 | `groupBy` (GROUP BY di DB), bukan dedupe memori. ✅ |
| `GET /sheets/:id/rows?filter` | 4 (sheet, columns, count, rows) | `EXISTS` di DB, validasi filter tanpa query ekstra. ✅ |
| `POST /sheets` | 1 read + tx | max+1 orderIndex dalam tx. ✅ |
| `POST/PATCH /columns` | 1–2 read + tx | validasi formula 1 query (semua kolom sheet). ✅ |
| `GET /rows` (dengan agregat) | 4 + **N kolom-agregat** | ⚠️ memuat seluruh kolom ke memori, hitung di JS (§4.7), N+1 ringan (§4.8). |
| `GET /sheets/:id/aggregates` | 1 + N kolom unik | ⚠️ idem; bisa disatukan jadi 1 `findMany IN`. |

**Issue utama (NEW):** agregat numerik dihitung di **memori aplikasi** atas seluruh nilai kolom.
PostgreSQL bisa melakukan `SUM/AVG/MAX/MIN/COUNT` jauh lebih cepat dengan satu query (perlu cast
`value::numeric`). Untuk Sprint 2 (data kecil) tak terasa; untuk skala impor = prioritas optimasi.

**Issue carried:** `updateRow` masih loop per-cell di transaksi (Sprint 1 §8). Tak disentuh Sprint 2.

### Caching Opportunities (bertambah relevan)
- Nilai agregat per sheet: kandidat cache dengan invalidate-on-write (row create/update/delete).
  Saat ini dihitung ulang tiap read — paling mahal di antara fitur baru.
- Pohon menu & kolom (carried dari Sprint 1) tetap kandidat.

### Memory
- Computed-on-read memuat kolom penuh per agregat (§4.7) — profil memori naik linear terhadap
  ukuran sheet × jumlah agregat. Worth watching setelah fitur impor besar dipakai.

---

## 9. Missing Features

### Carried dari Sprint 1 (belum dikerjakan di Sprint 2)
- **MF1. User Management CRUD** — masih hanya seed admin/kaprodi. `UsersModule` masih stub. *Tinggi.*
- **MF2. `GET /imports` (riwayat impor)** — belum ada. *Tinggi.*
- **MF5. Soft delete + riwayat versi dari `change_logs`** — belum ada `GET /change-logs`,
  hapus masih hard delete. *Sedang.* (Kini lebih relevan: agregat bahkan tak ber-audit, §4.10.)
- **MF6–MF9.** Healthcheck k8s-style, metrics, export Excel, search pg_trgm — belum.

### Baru muncul di Sprint 2
- **MF10. Endpoint reorder kolom/baris massal.** Kolom punya `orderIndex` tunggal-edit (PATCH),
  tapi tidak ada reorder transaksional banyak kolom sekaligus — UI drag-drop akan butuh ini.
- **MF11. Ubah tipe kolom.** Sengaja ditunda di slice 017 (konsekuensi data). Akan dibutuhkan saat
  "promote sheet cermin grid → semantik".
- **MF12. Audit untuk agregat.** Lihat §4.10 — bukan fitur besar, tapi gap kepatuhan.
- **MF13. Push-down agregat ke SQL.** Bukan fitur user, tapi prasyarat skala (§4.7).

---

## 10. Sprint 3 Recommendations

### High Priority
**HP1. Test Suite + CI — sekarang non-negotiable** (effort: 5–8 hari)
Identik dengan rekomendasi Sprint 1 yang diabaikan. Mulai dari yang termurah-bernilai-tertinggi:
unit test untuk fungsi murni baru — `computeFormula` (9 op + edge case), `computeVerticalAggregate`
(5 op), `validateFormulaDefinition` (siklus/self-ref/tipe), `getCellText` (termasuk regresi T-1).
Lalu e2e supertest untuk matriks tes negatif yang sudah ditulis manual di tiap task log — tinggal
dikodekan. **Bukti kebutuhan:** T-1 (formula tanggal) akan tertangkap unit test.

**HP2. Bayar Hutang Hardening Sprint 1** (effort: 2–3 hari)
Query log Prisma kondisional per env (H1), global exception filter (H2), validasi env saat boot (H3),
ganti `console.log` → `Logger` NestJS, hapus `test-read`/`test-write`, hapus stub `cells`/`rows`/`users`.
Semua sudah direkomendasikan Sprint 1; nol dikerjakan. Pre-requisite sebelum staging dipakai stakeholder.

**HP3. Refactor Kompute → `src/common/` + Pecah `SheetsService`** (effort: 3–4 hari)
- Ekstrak `toNum`/`fmt` → `common/number.util.ts` (§4.4).
- Ekstrak orkestrasi agregat → satu tempat; `getRows` inject `AggregatesService` (§4.3/4.5).
- Pindah `createRow`/`updateRow`/`deleteRow` → `RowsService` di `RowsModule` (carried R1).
- Ekstrak `@IsUuidPermissive()` decorator (§4.9, carried R6).
Dengan HP1 lebih dulu, refactor ini punya jaring pengaman.

**HP4. Audit untuk Agregat + Konsistensi Guardrail C** (effort: 0.5 hari)
Bungkus `createAggregate`/`deleteAggregate` dalam `$transaction` + tulis `ChangeLog` (§4.10).
Murah, menutup gap governance, mengembalikan konsistensi audit.

### Medium Priority
**MP1. Push-down Agregat Numerik ke SQL** (§4.7/§8) — `prisma.cell.aggregate` atau raw dengan
`value::numeric`; fallback JS untuk COUNT non-numerik. Prasyarat skala impor besar.
**MP2. User Management API (MF1)** + **`GET /imports` (MF2)** — carried, makin mendesak untuk demo realistis.
**MP3. Cache nilai agregat per sheet** dengan invalidate-on-row-write.
**MP4. Logger terstruktur (pino) + request ID** (carried).

### Nice to Have
**NTH1.** Reorder kolom/baris massal transaksional (MF10).
**NTH2.** Ubah tipe kolom dengan validasi/migrasi data sel (MF11).
**NTH3.** Soft delete + `GET /change-logs` (MF5, carried).
**NTH4.** Search pg_trgm, export Excel (carried).

---

## 11. Refactoring Opportunities

### R1 (NEW). Duplikasi Orkestrasi Agregat
- **File:** `aggregates.service.ts:getAggregates` ↔ `sheets.service.ts:getRows`.
- **Solusi:** `getRows` inject & panggil `AggregatesService.getAggregates(sheetId)`, atau ekstrak
  `computeAggregatesForSheet(sheetId)` ke service yang di-share. Hapus blok salinan di `getRows`.

### R2 (NEW). `toNum` / `fmt` Duplikat
- **File:** `sheets.service.ts` & `aggregates.service.ts`.
- **Solusi:** `src/common/number.util.ts` — satu sumber, import di kedua tempat.

### R3 (carried §11 R1, MEMBURUK). Pecah `SheetsService` (581 LOC)
- **Solusi:** `RowsService` (create/update/delete row) → `RowsModule` kosong yang sudah ada;
  `SheetsReadService` (columns/rows/values/filter); kompute pindah ke common (R1/R2).

### R4 (carried §11 R6). `UUID_RE` di 7+ DTO
- **Solusi:** custom decorator `@IsUuidPermissive()` di `src/common/decorators/`.

### R5 (NEW). Satukan N+1 Agregat
- **File:** `getAggregates` `Promise.all` per kolom.
- **Solusi:** satu `findMany({ where: { columnId: { in: uniqueColIds } } })` + grup di memori.

### R6 (carried §11 R5). `tx: any` di Imports — belum disentuh.
### R7 (carried §11 R8/R9). `console.log` main.ts + query log Prisma — belum disentuh.
### R8 (carried §11 R3). Stub `cells`/`rows`/`users` — belum dihapus/diisi.

---

## 12. Overall Scorecard

| Aspek | Sprint 1 | Sprint 2 | Arah | Justifikasi |
|---|---:|---:|:--:|---|
| **Architecture** | 7.5 | **6.8** | ▼ | 2 modul baru rapi, tapi `SheetsService` membengkak (343→581) + kompute bocor lintas modul. |
| **Scalability** | 6.0 | **5.5** | ▼ | Computed-on-read memuat kolom penuh ke memori; agregat numerik belum push-down ke SQL. |
| **Maintainability** | 8.0 | **7.5** | ▼ | Task log tetap kuat; duplikasi baru + masih 0 test menahan. |
| **Security** | 7.0 | **7.0** | = | Otorisasi config baru benar; gap hardening Sprint 1 utuh; 1 gap audit agregat (L4). |
| **Performance** | 7.0 | **6.5** | ▼ | Filter/breadcrumb/values efisien; kompute agregat tambah beban baca. |
| **Code Quality** | 6.9 | **6.7** | ▼ | Validasi formula highlight; duplikasi & gap audit agregat menarik turun. |
| **Production Readiness** | 5.5 | **5.5** | = | Nol gap prod-readiness Sprint 1 yang ditutup. Fitur naik, kesiapan prod diam. |

### Skor Komposit: **6.5/10** (turun tipis dari 6.8)

*Penurunan ini bukan kemunduran kualitas fitur — kapabilitas produk jelas bertambah dan disiplin
slice bertahan. Penurunan mencerminkan bahwa **permukaan kode tumbuh lebih cepat daripada
infrastruktur yang menjaganya**: hutang teknis Sprint 1 (test, hardening, SheetsService) tak dibayar,
sebagian memburuk, dan duplikasi baru muncul. Skor fitur naik; skor fondasi turun; net sedikit turun.*

---

## Closing Note (Honest Critique)

Sprint 2 adalah **sprint fitur yang sukses secara fungsional**. Engine yang di Sprint 1 hanya bisa
dibaca kini bisa dibentuk sepenuhnya via API — sheet, kolom bertingkat, formula horizontal dengan
deteksi siklus, dan agregat vertikal. Tiga keputusan terkunci dipatuhi tanpa drift. Dua slice
verifikasi (012, 022) menunjukkan kematangan: membuktikan dengan bukti runtime dan melaporkan temuan
secara jujur. Validasi formula (slice 020) adalah karya teknik yang rapi.

**Tapi tiga hal harus dikatakan terus terang:**

1. **Rekomendasi #1 Sprint 1 (test suite) diabaikan — dan taruhannya naik.** Sprint 2 menambah tiga
   fungsi murni kompleks (`computeFormula`, `computeVerticalAggregate`, `validateFormulaDefinition`)
   yang adalah kandidat unit-test paling sempurna, lalu tidak menulis satu test pun. Temuan T-1
   (formula tanggal) adalah bukti hidup: bug yang akan tertangkap test, lolos ke runtime.

2. **"Production readiness" tidak bergerak satu milimeter.** Setiap gap hardening Sprint 1 — query
   log bocor, no exception filter, no env validation, console.log, route uji, stub module — masih
   persis di tempatnya. Sprint 2 membangun di atas fondasi yang sama rapuhnya, hanya lebih tinggi.

3. **Pola "tulis ulang daripada ekstrak" muncul berulang.** `toNum`/`fmt` diduplikasi, orkestrasi
   agregat disalin lintas modul, `UUID_RE` ditambah dua kali, `assertWritableSheet` jadi tiga salinan.
   Masing-masing kecil; bersama-sama mereka adalah arah yang salah untuk basis kode yang akan terus
   tumbuh. Plus satu gap kepatuhan: agregat adalah satu-satunya mutasi tanpa ChangeLog.

**Rekomendasi paling impactful untuk Sprint 3 (jika hanya boleh satu): tetap HP1 (Test Suite + CI),
sekarang dipasangkan HP2 (bayar hutang hardening).** Sprint 2 membuktikan tim bisa mengirim fitur
dengan disiplin. Sprint 3 harus membuktikan tim bisa berhenti menumpuk hutang dan mulai membayarnya —
kalau tidak, setiap sprint fitur berikutnya makin mahal dan makin berisiko.

---

*Dokumen ini ditandatangani sebagai bagian dari review formal Sprint 2. Patuhi atau debat poin per
poin — jangan lewati diam-diam. Lihat `audit-sprint-1.md` untuk baseline dan jejak temuan carried.*
