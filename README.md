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

Jalankan tes aturan jadwal dengan `npm test`. Untuk regresi layar login, jalankan `npx playwright install chromium` sekali lalu `npm run test:login`. Jika Chromium sudah tersedia di mesin, tentukan jalurnya melalui `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Preview di chat

Jika membuka `public/index.html` dari preview Codex atau file tanpa server, pilih **Coba demo di sini**, lalu masuk dengan akun contoh dan `Password123`. Mode demo ditandai di seluruh aplikasi. Datanya hanya disimpan di memori tab, tidak dibagikan ke anggota, dan hilang saat halaman dimuat ulang. Login sebenarnya tetap memakai server; aplikasi tidak beralih ke demo tanpa pilihan pengguna.

Edit tampilan di `ui/index.html`; jalankan `npm run build` untuk memperbarui `public/index.html`. Build menyertakan `demo-runtime.js` dan algoritma `scheduler.js` yang sama untuk preview mandiri. Mode demo tidak mengakses database, cookie, atau jaringan aplikasi. Tes browser mencakup preview tanpa server, error login, timeout, sesi terblokir, dan alur demo Emen → Evan → Bowo.

## Hosting gratis

Aplikasi disiapkan untuk Cloudflare Workers + D1 dan alamat `workers.dev`. Paket gratis memiliki batas pemakaian; untuk tim kecil ini, penggunaan normal diperkirakan masuk batas gratis, tetapi periksa angka dan syarat saat membuat akun. Tidak perlu membeli domain.

Setelah akun Cloudflare tersedia, pengembang perlu:

1. Membuat database D1 `frame-kamera` lewat Wrangler dan mengisi `database_id` yang dihasilkan ke `wrangler.jsonc`.
2. Menjalankan `wrangler d1 migrations apply frame-kamera --remote`.
3. Menjalankan `npm run deploy`, lalu menguji login serta alur approval di alamat `workers.dev`.

Jangan menaruh token Cloudflare, password anggota, atau data PK di Git. Akun hosting dan token deploy harus disediakan melalui konfigurasi environment yang aman. Aplikasi bersama tim perlu disajikan lewat Worker; mode demo dalam preview tidak menggantikan deployment tersebut.
