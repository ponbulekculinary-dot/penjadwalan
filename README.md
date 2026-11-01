# Frame — penjadwalan tim kamera

Aplikasi web/H5 untuk tim kamera Tamsir dan MOI. Anggota dapat login, mengganti password, mencatat izin seharian, OFF sebulan, hanya bisa IR 1–2 dalam sebulan, dan mengajukan pilihan ibadah. Bowo mengelola status kas; anggota lain hanya melihat status kasnya sendiri.

Emen menyusun draft jadwal bulanan dari tombol **Generate jadwal**, dapat mengedit penugasan, lalu mengirimnya ke Evan. Evan dapat menyetujui dan menerbitkan jadwal atau meminta revisi. Anggota melihat tugas dan total PK miliknya sendiri serta jumlah pelayanan setiap anggota. Emen dan Evan dapat melihat jadwal dan total PK seluruh tim.

## Pengembangan lokal

Butuh Node.js 20+. Jalankan dari root proyek:

```sh
npm ci
npm run db:local
npm run dev
```

Buka alamat lokal yang ditampilkan Wrangler. Akun awal memakai nama anggota (misalnya `emen`, `evan`, atau `bowo`) dan password `Password123`. Setiap orang perlu segera mengganti password awal melalui menu Akun supaya privasi PK antar akun berlaku. Data lokal D1 berada di `.wrangler/` dan tidak masuk Git.

Jalankan tes aturan jadwal dengan `npm test`. Tes browser dan API sudah mencakup login, batas izin, akses Bowo, alur Emen → Evan, dan kerahasiaan PK anggota.

## Hosting gratis

Aplikasi disiapkan untuk Cloudflare Workers + D1 dan alamat `workers.dev`. Paket gratis memiliki batas pemakaian; untuk tim kecil ini, penggunaan normal diperkirakan masuk batas gratis, tetapi periksa angka dan syarat saat membuat akun. Tidak perlu membeli domain.

Setelah akun Cloudflare tersedia, pengembang perlu:

1. Membuat database D1 `frame-kamera` lewat Wrangler dan mengisi `database_id` yang dihasilkan ke `wrangler.jsonc`.
2. Menjalankan `wrangler d1 migrations apply frame-kamera --remote`.
3. Menjalankan `npm run deploy`, lalu menguji login serta alur approval di alamat `workers.dev`.

Jangan menaruh token Cloudflare, password anggota, atau data PK di Git. Akun hosting dan token deploy harus disediakan melalui konfigurasi environment yang aman. File HTML perlu disajikan lewat Worker; membuka file itu di penampil dokumen tidak menjalankan aplikasi.
