# 009 — Perbarui audit Sprint 1 ke kondisi terbaru

## Tujuan
Memperbarui `docs/report/audit-sprint-1.md` agar mencakup seluruh perubahan setelah audit
ditandatangani (2026-06-20), tanpa menghapus jejak skor & temuan asli.

## Rencana singkat
- Telusuri commit & task log sejak base audit (`aefb576`).
- Verifikasi kondisi kode terkini (test, query-log, route uji, formula handling, ekspos merges).
- Tambah **Addendum #2 (2026-06-27)** + perbarui metadata header.

## File diubah

| File | Alasan |
|------|--------|
| `docs/report/audit-sprint-1.md` | Tambah Addendum #2 + bump metadata (tanggal, LOC, jumlah file) |
| `docs/tasks/009-audit-update.md` | Task log ini |

## Keputusan kunci
- **Append, bukan edit inline.** Dokumen secara eksplisit menghargai jejak skor asli yang
  dapat dirujuk (lihat catatan T7). Penyesuaian skor dinyatakan di addendum, bukan menimpa §12.
- **Jujur soal gap audit asli.** Dua fix (DTPS merge-vertikal, `[object Object]`) menutup bug
  yang luput dari audit asli — dicatat sebagai gap pelacakan, bukan disembunyikan.
- **Re-verifikasi item terbuka, bukan asumsi.** Status "masih terbuka" dikonfirmasi langsung
  ke kode terkini (0 `.spec.ts`, `prisma.service.ts:14`, `auth.controller.ts:83-97`, dst.).

## Belajar dari sini
Audit hidup: laporan kualitas bukan dokumen sekali-tulis. Saat kode bergerak, laporan harus
ikut — tapi dengan **append + jejak**, bukan rewrite, supaya pembaca bisa melihat *apa yang
berubah dan kapan*. Klaim "DoD lulus" di audit asli ternyata belum tervalidasi sel-per-sel;
pelajaran: verifikasi korektabilitas data sampai ke isi baris, bukan berhenti di header.
