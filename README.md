# Frame — penjadwalan tim kamera

Aplikasi web/H5 untuk tim kamera Tamsir dan MOI. Anggota dapat login, mengganti password, mencatat izin seharian, OFF sebulan, pilihan beberapa ibadah di MOI dan/atau Tamsir selama sebulan, dan mengajukan pilihan ibadah. Bowo mengelola status kas; anggota lain hanya melihat status kasnya sendiri.

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

Ketersediaan sekarang mendukung izin satu tanggal, OFF sebulan, serta pilihan beberapa ibadah di dua lokasi dalam satu aturan bulanan yang dapat diedit. Kalender multi-tanggal, edit tanggal izin, riwayat kas multi-bulan, dan perubahan scoring pemerataan masih belum termasuk. Kelompok pemerataan lama (anggota yang bisa Switcher, termasuk Ayu) belum diubah; keputusan kelompok Ayu masih perlu dikonfirmasi. Tidak ada klaim semua fitur prototype telah selesai.

## Tukar dua penugasan

Pada dialog edit draft milik Emen, pilih **Tukar tugas**, lalu pilih penugasan kedua. Daftar memprioritaskan pertukaran valid pada tanggal yang sama. Preview menampilkan siapa menggantikan siapa pada kedua slot dan dampak total PK bulanan, tanpa nominal PK per slot. **Urungkan edit terakhir** mengembalikan kedua penugasan bersama selama versi jadwal/ketersediaan belum berubah.

`POST /api/schedule/swap` menerima `month`, `index`, `targetIndex`, `revision`, dan `availabilityRevision`. Hanya Emen, pada status draft. Backend membuat salinan hasil akhir, menukar nama (role/jam/tarif slot tetap), lalu memvalidasi kedua anggota beserta tugas lain pada tanggal yang terdampak. Kedua slot disimpan dalam satu conditional write dan satu entri audit `swap`; tidak ada slot kosong sementara atau hasil setengah tersimpan. Jadwal resmi tidak berubah sampai Evan menyetujui revisi.

Kedua slot harus terisi anggota berbeda. Pertukaran dapat lintas tanggal/role jika keduanya memenuhi role, izin, jam, jeda 60 menit, dan maksimal satu perpindahan lokasi/hari. Ini pertukaran dua penugasan, bukan pemindahan seluruh rangkaian tugas sehari. Konflik yang tetap ada setelah pertukaran ditolak dengan alasan.

`npm test` menyertakan 5 tes swap (aturan dan API/database). `npm run test:swap` menguji tombol, preview, penyimpanan, undo, mode demo, dan dialog mobile 320/375/430. Untuk menyimpan screenshot fixture QA, set `FRAME_SCREENSHOT_DIR` ke direktori di luar repository.


## Ketersediaan per ibadah dan rincian anggota

- Pilih **Hanya bisa ibadah tertentu**, tentukan bulan, centang MOI dan/atau Tamsir, lalu centang beberapa ibadah masing-masing lokasi. Sekali simpan membuat satu aturan bulanan. MOI menawarkan IR 1–4, Tamsir IR 1–3, dengan jam ditampilkan (MOI IR 3 mulai 13.00, bukan dianggap pagi otomatis).
- `month_services` menyimpan whitelist `services_json` berisi pasangan `{location,service}`. Generator, edit, swap, submit/approval, dan pengajuan preferensi memakai batasan yang sama. Lokasi/ibadah yang tidak dipilih tidak boleh dijadwalkan. Izin seharian/OFF tetap mengalahkan whitelist.
- Satu aturan per member/bulan; mengubah pilihan memakai ID pengajuan milik sendiri. Pengajuan bulan berbeda dapat dibuat terpisah. API lama `month_morning` dinormalisasi ke whitelist agar klien lama tetap kompatibel.
- Migration `0005_service_availability.sql` mengonversi aturan pagi lama sambil mempertahankan batas efektifnya. Jika aturan lama saling menutup (misalnya MOI saja dan Tamsir saja sekaligus), hasilnya tetap tidak tersedia di semua ibadah sampai anggota mengoreksi pilihannya. Tanggal izin individual tetap dipertahankan.
- Rincian pribadi dan tim dikelompokkan per anggota: **Izin seharian**, **Batasan bulanan**, **Preferensi**. Semua entri yang sesuai filter ditampilkan berurutan, tanpa mengambil hanya satu tanggal/entri terbaru. Filter aktif ditandai jelas dan dapat direset. Beranda tetap ringkasan lima pengajuan terbaru dengan tautan melihat seluruh rincian.
- Pengujian mereproduksi Ayu izin 15 dan 22 November serta preferensi 8 dan 29 November; keempatnya tetap muncul. Ini membuktikan perilaku kode dan bukan pemulihan atau pemeriksaan data sesi Netlify pengguna. Data demo lama yang hilang karena refresh tidak dapat direkonstruksi dari screenshot.
- Jalankan `npm run db:local` sebelum memakai server lokal versi ini. Cloud/Netlify belum diperbarui; deployment produksi memerlukan migration yang sama. Mode demo masih hanya di memori tab dan reset saat refresh.
- `npm test` mencakup 3 tes tambahan whitelist/migration/API. `npm run test:availability` menguji input, edit, rincian beberapa tanggal, persistensi, filter, mode demo, dan layar 320/375/430.
