# Fix: Header tabel DTPS bergeser (BUG FRONTEND, bukan backend)

> Catatan handoff untuk dikerjakan di repo **`arsip-frontend`**.
> Backend (`arsip-backend`) TIDAK perlu diubah.

## Gejala
Di halaman `/sheets/:id` (contoh sheet `a569e34b-f32d-41d0-87e9-ec8f4e220a89`),
**body** tabel benar, tapi **header** bergeser: label (No., Nama Dosen, Magister, Doktor,
Jabatan Akademik) menumpuk di kanan dengan sel kosong di bawahnya, sementara data berada di
bawah sel header kosong/grup di kiri.

## Hasil investigasi: ini 100% masalah FRONTEND

### Backend sudah benar (terverifikasi)
- Query DB: kolom membentuk pohon dengan urutan benar:
  `No.(1) → Nama Dosen(2) → Kualifikasi Akademik Terakhir(3) [Magister, Doktor] →
  Jabatan Akademik(4) → NIDN(5) → Link Dokumen(6)`.
- Cell ter-map ke kolom yang benar (baris 1: No.=`1`, Nama Dosen=`Anas Puji Santoso, Ir., M.T.`,
  Magister=`Teknik Perminyakan`, Doktor=`-`, Jabatan=`Lektor`, NIDN=`0017026012`, Link=URL).
- Endpoint `GET /sheets/:id/columns` & `/sheets/:id/rows` mengembalikan struktur & urutan benar.

### Akar masalah (frontend)
File: `src/features/sheets/components/SheetTable.tsx` — pada `<th>` di dalam `<thead>`:

```tsx
rowSpan={header.rowSpan}   // <-- baris bermasalah (sekitar baris 74)
```

Diuji dengan TanStack Table **v8.21.3** memakai struktur kolom persis di atas:
`header.rowSpan === 0` untuk **SEMUA** header. (TanStack v8 TIDAK memakai rowSpan untuk
menggabung header secara vertikal — ia memakai *placeholder cell* + `colSpan`.)

Hasil `getHeaderGroups()`:
- Baris atas:  `No.{placeholder} Nama{placeholder} Kualifikasi{colSpan2} Jabatan{placeholder} NIDN{placeholder} Link{placeholder}`
- Baris bawah: `No. Nama Magister Doktor Jabatan NIDN Link` (semua nyata)
- `rowSpan = 0` di semua header.

Karena `rowSpan={0}` dirender ke `<th>`, dan aturan HTML **`rowSpan="0"` = "span semua baris
sisa di section"**, maka setiap sel baris-atas (termasuk placeholder kosong) memanjang ke
baris-bawah, mendorong label baris-bawah ke kanan. Itulah pergeseran yang terlihat.

## Perbaikan (minimal — disetujui user)
Hapus atribut `rowSpan`. Pola grouped-header kanonik TanStack v8 hanya pakai
`colSpan` + `isPlaceholder`.

```tsx
<th
  key={header.id}
  colSpan={header.colSpan}
  scope={header.colSpan > 1 ? 'colgroup' : 'col'}
  className="…tidak berubah…"
>
  {header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext())}
</th>
```

(Cukup hapus baris `rowSpan={header.rowSpan}`. Sisanya tetap.)

### Hasil setelah fix
- Baris atas:  `[ — ][ — ][ Kualifikasi Akademik Terakhir (colSpan 2) ][ — ][ — ][ — ]`
- Baris bawah: `[No.][Nama Dosen][Magister][Doktor][Jabatan Akademik][NIDN][Link Dokumen]`
- Body sejajar sempurna di bawah tiap leaf.

Catatan: label kolom mandiri (No., Nama, dst.) tampil di baris bawah dengan sel kosong di
atasnya — ini tampilan standar dan benar. (Kalau nanti mau gaya "sel tinggi tergabung" ala
Excel, hitung rowSpan manual: `rowSpan = jumlahBarisHeader - header.depth` untuk leaf
non-grup dan lewati placeholder — opsional, bukan bagian fix ini.)

## Verifikasi
1. Frontend dev di http://localhost:5173, backend di :3000.
2. Buka http://localhost:5173/sheets/a569e34b-f32d-41d0-87e9-ec8f4e220a89.
3. Pastikan "Kualifikasi Akademik Terakhir" menutupi tepat kolom Magister + Doktor; tiap
   label lain persis di atas kolom datanya; tidak ada label menumpuk di kanan; tidak ada
   overflow horizontal.
4. Cek baris 1: `1 | Anas Puji Santoso… | Teknik Perminyakan | - | Lektor | 0017026012 | Buka folder`.
