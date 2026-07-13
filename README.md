# Sinotaris

Sistem Informasi Kantor Notaris & PPAT — aplikasi manajemen kantor: klien, pekerjaan/akta, generator dokumen, invoice, laporan bulanan, pengingat, dan kalkulator biaya.

Pengembangan lanjutan dari [skmht-generator](https://github.com/Errs404/skmht-generator), dengan referensi fitur dari notarisapp.id.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4)
- **Prisma 7** + **PostgreSQL** (driver adapter `@prisma/adapter-pg`)
- **NextAuth v5** — login credentials, role `NOTARIS` (admin) / `STAF`
- **docxtemplater + pizzip** — generator dokumen Word (diporting dari skmht-generator)

## Arsitektur penting

- **Multi-tenant**: semua data terikat ke `Office` (kantor). Siap dijadikan SaaS berlangganan.
- **Subscription**: tabel `Subscription` per kantor. Kalau tidak aktif → aplikasi jadi **mode baca saja** (cek via `src/lib/subscription.ts`, `assertWritable()` wajib dipanggil di semua operasi tulis).
- **Role**: field biaya/honorarium hanya untuk role `NOTARIS`.

## Menjalankan secara lokal

1. Jalankan PostgreSQL (contoh pakai Docker):

   ```powershell
   docker run --name sinotaris-db -e POSTGRES_PASSWORD=sinotaris -e POSTGRES_DB=sinotaris -p 5432:5432 -d postgres:17
   ```

2. Salin env dan isi `AUTH_SECRET`:

   ```powershell
   Copy-Item .env.example .env
   npx auth secret   # atau isi manual
   ```

3. Install, migrasi, seed:

   ```powershell
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. Jalankan:

   ```powershell
   npm run dev
   ```

   Buka http://localhost:3000 — login default: `notaris@sinotaris.local` / `sinotaris123`.

## Struktur

- `prisma/schema.prisma` — schema database (Office, User, Subscription, Client, Pekerjaan, Invoice, Reminder, DocTemplate, GeneratedDoc)
- `prisma/seed.ts` — data awal (kantor + akun notaris + trial 30 hari)
- `src/auth.ts` — konfigurasi NextAuth + helper `requireSession` / `requireNotaris`
- `src/middleware.ts` — proteksi route `/dashboard`
- `src/lib/indoDate.ts` — tanggal & terbilang Bahasa Indonesia (dari skmht-generator, diperluas s.d. triliun + rupiah)
- `src/lib/docx.ts` — generator DOCX + kalibrasi garis putus-putus (dari skmht-generator)
- `src/lib/calculator.ts` — kalkulator BPHTB, PPh Final, honorarium UUJN Pasal 36
- `src/lib/subscription.ts` — cek status langganan / mode baca saja
- `src/app/dashboard/` — halaman aplikasi (layout + sidebar)

## Catatan keamanan

- File template `.docx` dan dokumen hasil generate disimpan di `storage/` — **tidak dipush ke Git** karena berisi data klien (NIK, alamat, dsb).
- `.env` tidak dipush; gunakan `.env.example` sebagai acuan.

## Roadmap

- [x] Fondasi: auth, schema multi-tenant, subscription check, dashboard shell
- [ ] CRUD Klien
- [ ] CRUD Pekerjaan (Notaris & PPAT terpisah)
- [ ] Generator dokumen (upload template + form dinamis, mulai dari SKMHT)
- [ ] Invoice & tanda terima (PDF)
- [ ] Laporan bulanan Notaris & PPAT (PDF format ATR/BPN)
- [ ] Pengingat + notifikasi
- [ ] Kalkulator biaya (UI)
- [ ] Ekspor Excel
- [ ] Halaman billing/langganan
