# Frame — penjadwalan tim kamera

Aplikasi web/H5 untuk tim kamera Tamsir dan MOI. Saat ini tersedia login anggota, ganti password, pencatatan izin harian, OFF sebulan, hanya bisa IR 1–2 sebulan, special request ibadah, dan kas tim. Bowo adalah bendahara: hanya akunnya yang bisa mengubah status pembayaran. Anggota lain melihat statusnya sendiri dan mendapat popup saat login jika tercatat belum bayar.

## Menjalankan

Butuh Python 3.10+; tidak ada paket tambahan. Jalankan dari root proyek:

```sh
python server.py
```

Buka `http://localhost:8000` di browser. Akun awal memakai nama anggota (misalnya `emen` atau `bowo`) dan password `Password123`. Setiap anggota bisa mengubah password dari menu Akun. Data SQLite tersimpan di `.data/app.sqlite3` dan tidak masuk Git.

Untuk port atau lokasi database lain, atur `PORT` dan `PENJADWALAN_DB` sebelum menjalankan server. Saat dipasang di hosting, gunakan volume persisten untuk database dan HTTPS; password awal yang sama harus diganti oleh setiap anggota.

Jalankan pemeriksaan alur backend dengan:

```sh
python -m unittest test_server.py
```

Pengajuan special request adalah preferensi; izin dan pembatasan pagi adalah batas ketersediaan. Generator jadwal bulanan belum dibuat pada tahap ini.
