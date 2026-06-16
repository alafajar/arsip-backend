# Guardrails Engineering — tempel ke setiap prompt blok 3

> Bagian ini berisi praktik pencegahan yang biasa diterapkan backend senior.
> **Penting:** checklist ini memastikan agent *mencoba* praktik di bawah. Ia **tidak** membuktikan hasilnya benar — bukti tetap dari (a) review kode aktual dan (b) tes negatif di Postman. Jangan perlakukan daftar ini sebagai jaminan.

---

## A. Selalu (berlaku di semua slice)

- **Validasi input di boundary.** Parameter UUID pakai `ParseUUIDPipe`; body pakai DTO + `class-validator`. Input tak valid ditolak sebelum menyentuh DB.
- **Status code benar:** 200/201 sukses, 400 input salah, 401 belum login, 403 tak berhak, 404 tak ada, 500 **hanya** untuk bug tak terduga. **Jangan pernah** kirim stack trace / detail internal ke klien.
- **Otentikasi di setiap endpoint** (`JwtAuthGuard`), kecuali yang sengaja publik — dan yang publik harus disebut eksplisit beserta alasannya di task log.
- **Pilih field respons secara sadar** (`select`). Jangan dump seluruh kolom termasuk field audit/internal yang tak dibutuhkan UI.
- **Tidak ada rahasia di kode.** Semua kredensial/konfigurasi dari env.
- **Anti N+1:** ambil data dengan satu query (`include`/`select`), bukan loop yang memicu query per-item.
- **Seed idempoten.** Jalan dua kali tidak menggandakan, tidak error.
- **Konsisten dengan `CLAUDE.md`** untuk penamaan, struktur folder, dan format task log.

## B. Begitu ada endpoint daftar (list)

- **Wajib ada batas/pagination.** Jangan pernah kembalikan koleksi tak terbatas.
- **Urutan deterministik** (`ORDER BY` eksplisit) supaya hasil stabil dan bisa di-page.

## C. Saat mulai menulis (blok tulis, 3-write dan sesudahnya)

- **Validasi per tipe kolom** (7 tipe: date/text/integer/float/boolean/marking/url) sebelum simpan.
- **Transaksi** untuk operasi multi-langkah (semua-atau-tidak; jangan setengah tersimpan).
- **Otorisasi peran** pada aksi tulis (kaprodi vs admin) di server — **jangan** mengandalkan UI menyembunyikan tombol.
- **Audit trail terisi** (siapa, kapan, aksi apa) untuk perubahan data.

## D. Database & performa

- **Indeks** pada kolom yang sering difilter — khususnya FK di `cells` (`sheetId`, `rowId`, `columnId`). Verifikasi ada di `schema.prisma`.
- **Baca cell (3d):** ambil semua cell satu sheet dalam **satu** query lalu pivot di memori. Jangan query per-cell atau per-baris.
- **Migrasi:** review sebelum apply. Ke produksi **hanya** `prisma migrate deploy`; **tidak pernah** `reset`/`seed` di produksi.

## E. Observability minimal

- Log error di server, **tanpa** membocorkan data sensitif (password, token, isi cookie).

---

## Tes negatif wajib di Postman (bukan cuma jalur 200)

Untuk tiap endpoint, jalankan juga:
- Tanpa token → **401**
- Token valid tapi (saat relevan) peran salah → **403**
- ID tak ada → **404**
- Input/format salah (mis. bukan UUID) → **400**

Jalur 200 yang hijau **tidak** memberitahu apa pun soal empat kasus di atas.
