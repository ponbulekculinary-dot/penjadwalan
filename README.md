# Frame — penjadwalan tim kamera

Aplikasi web/H5 untuk tim kamera Tamsir dan MOI. Anggota dapat login, mengganti password, mencatat izin seharian, OFF sebulan, hanya bisa IR 1–2 dalam sebulan, dan mengajukan pilihan ibadah. Bowo mengelola status kas; anggota lain hanya melihat status kasnya sendiri.

Emen menyusun draft jadwal bulanan dari tombol **Generate jadwal**, dapat mengedit penugasan, lalu mengirimnya ke Evan. Evan dapat menyetujui dan menerbitkan jadwal atau meminta revisi. Anggota melihat tugas dan total PK miliknya sendiri serta jumlah pelayanan setiap anggota. Emen dan Evan dapat melihat jadwal dan total PK seluruh tim.

## Pengembangan lokal

Butuh Node.js 22.13+ (Node.js 24 direkomendasikan untuk test SQLite). Jalankan dari root proyek:

```sh
npm ci
npm run db:local
npm run dev
```

Buka alamat lokal yang ditampilkan Wrangler. Akun memakai nama anggota. Server **tidak menerima `Password123`**, termasuk jika database lama pernah menyimpan hash password tersebut. Akun baru memiliki password kosong dan perlu diprovisikan oleh pengelola dengan password unik. Gunakan prosedur provisioning di bawah; jangan membagikan satu password untuk semua anggota. Data lokal D1 berada di `.wrangler/` dan tidak masuk Git.

Jalankan tes aturan jadwal dengan `npm test`. Untuk regresi layar login, jalankan `npx playwright install chromium` sekali lalu `npm run test:login`. Jika Chromium sudah tersedia di mesin, tentukan jalurnya melalui `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Preview di chat

Jika membuka `public/index.html` dari preview Codex atau file tanpa server, pilih **Coba demo di sini**, lalu masuk dengan akun contoh dan `Password123`. Mode demo ditandai di seluruh aplikasi. Datanya hanya disimpan di memori tab, tidak dibagikan ke anggota, dan hilang saat halaman dimuat ulang. Login sebenarnya tetap memakai server; aplikasi tidak beralih ke demo tanpa pilihan pengguna.

Edit kerangka tampilan di `ui/index.html`, halaman review di `ui/review.js`, dan styling di `ui/review.css`; jalankan `npm run build` untuk memperbarui `public/index.html`. Build menyertakan `demo-runtime.js` dan algoritma `scheduler.js` yang sama untuk preview mandiri. Mode demo tidak mengakses database, cookie, atau jaringan aplikasi. Tes browser mencakup preview tanpa server, error login, timeout, sesi terblokir, dan alur demo Emen → Evan → Bowo.

## Hosting gratis

Aplikasi disiapkan untuk Cloudflare Workers + D1 dan alamat `workers.dev`. Paket gratis memiliki batas pemakaian; untuk tim kecil ini, penggunaan normal diperkirakan masuk batas gratis, tetapi periksa angka dan syarat saat membuat akun. Tidak perlu membeli domain.

Setelah akun Cloudflare tersedia, pengembang perlu:

1. Membuat database D1 `frame-kamera` lewat Wrangler dan mengisi `database_id` yang dihasilkan ke `wrangler.jsonc`.
2. Menjalankan `wrangler d1 migrations apply frame-kamera --remote`.
3. Menjalankan `npm run deploy`, lalu menguji login serta alur approval di alamat `workers.dev`.

Jangan menaruh token Cloudflare, password anggota, atau data PK di Git. Akun hosting dan token deploy harus disediakan melalui konfigurasi environment yang aman. Aplikasi bersama tim perlu disajikan lewat Worker; mode demo dalam preview tidak menggantikan deployment tersebut.


## Implementasi review & database — November 2026

- Grid bulanan untuk Emen/Evan, tanpa nominal PK per slot; rekap PK hanya total bulanan.
- Emen melihat ketersediaan tim, kandidat yang valid beserta alasan kandidat ditolak, serta dampak perubahan pada jumlah tugas dan total PK bulanan. Urungkan edit terakhir hanya tersedia selama versi jadwal masih sama.
- Evan melakukan review, meminta revisi dengan catatan, atau menyetujui sekaligus menerbitkan. Draft yang pending tidak bisa diedit.
- Agenda member mengelompokkan semua ibadah per hari, menampilkan jam/lokasi/role dan tim tiap ibadah. API member hanya mengirim total PK pribadi dan jumlah pelayanan tim; nominal PK rekan tidak dikirim.
- `0004_review_history.sql` menambahkan nomor revisi, aktor, riwayat snapshot sebelum/sesudah, serta epoch ketersediaan. Penulisan jadwal memakai conditional write dan trigger audit atomik. Perubahan bersamaan atau approval dengan ketersediaan lama ditolak (409).
- Tombol **Buat revisi dari jadwal resmi** menyalin jadwal terbit ke draft agar beberapa slot dapat diperbaiki tanpa generate ulang.
- Draft baru tidak menghapus `published_json`. Anggota terus melihat jadwal resmi terakhir sampai Evan menyetujui revisinya.
- Aturan satu kali pindah lokasi/hari, jeda 60 menit, role dan izin berlaku untuk generator, edit manual, submit dan approval.

### Provisioning akun (tugas pengembang)

1. Masukkan password unik minimal 12 karakter lewat secret environment `FRAME_ACCOUNT_PASSWORD`, bukan argumen shell atau commit.
2. Jalankan `node scripts/account-sql.mjs EMEN /tmp/frame-account.sql` (ganti nama anggota sesuai kebutuhan). SQL hanya berisi hash dan membatalkan sesi lama akun tersebut.
3. Jalankan `npx wrangler d1 execute frame-kamera --local --file /tmp/frame-account.sql` untuk lokal, atau `--remote` untuk database produksi yang telah disetujui.
4. Hapus file SQL, bersihkan environment variable, dan berikan password melalui kanal pribadi. Anggota dapat menggantinya lewat menu Akun.

Migrasi tidak mereset password/data lama. Akun lama yang memakai password demo perlu diprovisikan ulang. Password demo tetap tersedia dalam mode browser demo yang terpisah.

### Validasi

- `npm test`: 8 tes aturan scheduler + 2 skenario integrasi API/database (SQLite file dibuka ulang untuk memeriksa persistensi).
- `npm run test:login`: 9 tes login dan standalone demo.
- `npm run test:review`: browser dengan Worker handler dan database SQLite nyata; grid/edit, versi, approval, agenda member, dan viewport 320/375/430.
- Chromium sistem dapat dipilih lewat `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
- Worker/workerd dan D1 lokal juga sudah diuji terpisah untuk alur login → generate → submit → approve, trigger riwayat, dan privasi PK. Tes lokal tidak membuktikan deployment cloud.

### Persiapan produksi dan pemulihan

Database cloud belum dibuat: `database_id` masih placeholder, dan `predeploy` sengaja menolak deployment sampai ID nyata diisi. Dibutuhkan akun Cloudflare Free dan credential melalui environment settings. Tidak ada secret di repository.

Sebelum migration produksi, ekspor database dengan `wrangler d1 export frame-kamera --remote --output <path-backup-private>`; simpan backup di lokasi privat di luar Git. Terapkan seluruh migration, provision akun, lalu deploy hanya setelah disetujui. Pada kegagalan migration, hentikan rollout dan gunakan backup untuk pemulihan ke database pengganti; jangan menghapus tabel untuk mencoba ulang. Kode lama yang menulis jadwal tanpa nomor revisi tidak kompatibel dengan trigger baru, sehingga rollback perlu mempertimbangkan kode **dan** database.

Riwayat berisi snapshot lengkap dan PK; endpoint riwayat hanya memberi metadata kepada Emen/Evan. Jangan menerbitkan file database atau backup. `public/index.html` hanya berisi kode dan akun demo, bukan data nyata.

### Batas fase ini

Model ketersediaan saat ini tetap izin satu tanggal, OFF sebulan, dan pagi selama sebulan; UI menyatukan akses ke preferensi di menu Ketersediaan. Kalender multi-tanggal, edit izin, pembatasan layanan arbitrer, riwayat kas multi-bulan, dan perubahan scoring pemerataan belum termasuk fase review ini. Kelompok pemerataan lama (anggota yang bisa Switcher, termasuk Ayu) belum diubah; keputusan kelompok Ayu masih perlu dikonfirmasi. Tidak ada klaim semua fitur prototype telah selesai.
