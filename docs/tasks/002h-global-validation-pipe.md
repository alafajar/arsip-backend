# 002h — Global ValidationPipe

## Tujuan
Memasang `ValidationPipe` secara global di `main.ts` agar validasi DTO berjalan
di semua endpoint tanpa harus menempel pipe per-handler.

## Rencana singkat
1. Tambah `app.useGlobalPipes(new ValidationPipe({...}))` di `main.ts`.
2. Hapus `@UsePipes(new ValidationPipe(...))` lokal dari handler `login` di
   `auth.controller.ts` serta import `UsePipes` dan `ValidationPipe` yang kini
   tidak terpakai.

## File diubah
- `src/main.ts` — tambah import `ValidationPipe` dan panggil `useGlobalPipes`
  setelah `cookieParser`.
- `src/auth/auth.controller.ts` — hapus `@UsePipes` lokal dan dua import yang
  menjadi redundan (`UsePipes`, `ValidationPipe`).

## Keputusan kunci
- Opsi `whitelist: true` + `forbidNonWhitelisted: true` + `transform: true`
  dipilih karena paling defensif: field asing langsung ditolak (bukan hanya
  dibuang diam-diam), dan payload otomatis dikonversi ke tipe DTO.
- Pipe global dipasang sebelum filter throttler agar urutan middleware tetap
  konsisten (parsing → validasi → handling).

## Belajar dari sini

### Apa yang dilakukan setiap opsi?
| Opsi | Perilaku |
|---|---|
| `whitelist: true` | Field yang tidak ada di DTO langsung dibuang sebelum handler dipanggil. |
| `forbidNonWhitelisted: true` | Jika ada field asing, langsung balas **400 Bad Request** (bukan sekadar diabaikan). Membutuhkan `whitelist: true`. |
| `transform: true` | Payload plain JSON dikonversi ke instance kelas DTO, sehingga tipe TypeScript dan decorator `class-transformer` (mis. `@Type(() => Number)`) bekerja. |

### Kenapa pipe global lebih aman daripada per-handler?
Dengan pipe per-handler, engineer harus **mengingat** untuk menempel decorator di
setiap endpoint tulis baru — mudah lupa. Satu endpoint yang terlewat berarti input
tidak tervalidasi masuk langsung ke ORM dan database. Pipe global membalik default:
**semua endpoint divalidasi secara otomatis**; pengecualian harus dinyatakan eksplisit.
Prinsip ini disebut *secure by default* — kesalahan arah (lupa opt-out) jauh lebih
aman daripada kesalahan arah (lupa opt-in).
