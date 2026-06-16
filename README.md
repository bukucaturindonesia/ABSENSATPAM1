# ABSENSI GKN MAMUJU

Aplikasi absensi statis berbasis HTML, CSS, JavaScript, dan Supabase untuk pegawai GKN Mamuju.

Bagian pegawai:

- Pramubakti
- Cleaning Service
- Satpam
- Teknisi
- Driver

## File Utama

- `index.html` - halaman pilihan Login Pegawai dan Login Admin.
- `login.html` - login pegawai dengan nama dan PIN.
- `absen.html` - dashboard pegawai, absensi, profil, riwayat, dan pengajuan.
- `admin.html` - login dan dashboard admin multi-role.
- `script.js` - logika portal pegawai.
- `admin.js` - logika dashboard admin.
- `supabase.js` - konfigurasi anon key dan pemanggilan RPC.
- `supabase-setup.sql` - tabel, RLS, RPC, storage, lokasi, pegawai awal, dan admin awal.
- `style.css` - tampilan modern responsif.

## Cara Menjalankan SQL Supabase

1. Buka project Supabase.
2. Masuk ke **SQL Editor**.
3. Buat query baru.
4. Paste seluruh isi `supabase-setup.sql`.
5. Klik **Run**.

SQL ini membuat tabel:

- `guards`
- `attendance`
- `leave_requests`
- `admin_users`
- `admin_sessions`
- `office_locations`

Semua akses tabel ditutup oleh RLS. Frontend hanya memakai RPC dengan anon key.

## Mengisi SUPABASE_URL dan SUPABASE_ANON_KEY

Buka `supabase.js`, lalu ganti:

```js
export const SUPABASE_URL = "YOUR_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Ambil nilainya dari **Project Settings > API**:

- `SUPABASE_URL`: Project URL.
- `SUPABASE_ANON_KEY`: anon public key / publishable key.

Jangan memasukkan `service_role` key ke frontend.

## Login Super Admin

Setelah SQL dijalankan:

- Username: `superadmin`
- Password: `GKN-Super-2026!`

Segera ganti password/PIN admin awal setelah instalasi.

## Akun Admin Awal

- `superadmin` / `GKN-Super-2026!`
- `adminumum` / `GKN-Umum-2026!`
- `adminsatpam` / `Satpam-2026!`
- `adminteknisi` / `Teknisi-2026!`
- `adminpramubakti` / `Pramubakti-2026!`
- `admincleaning` / `Cleaning-2026!`
- `admindriver` / `Driver-2026!`

## PIN Pegawai Awal

Semua pegawai seed memakai PIN sementara:

```text
1234
```

PIN bisa diedit oleh Super Admin atau oleh pegawai melalui menu profil.

## Cara Menambah Pegawai

1. Login sebagai Super Admin.
2. Buka menu **Data Pegawai**.
3. Klik **Tambah Pegawai**.
4. Isi nama, bagian, shift, telepon, bio, status aktif, dan PIN.
5. Klik **Simpan**.

Admin Umum dan Admin Bagian hanya dapat melihat data pegawai sesuai hak akses.

## Cara Tes Absen Masuk

1. Buka `login.html`.
2. Login pegawai, misalnya `Abdul Haris` dengan PIN `1234`.
3. Buka form **Absen Masuk**.
4. Pilih/ambil foto selfie.
5. Isi keterangan jika diperlukan.
6. Klik **Ambil GPS & Absen Masuk**.
7. Izinkan akses lokasi di browser.

Jika masuk setelah 07:35 WITA, status otomatis menjadi `Terlambat`.

## Cara Tes Absen Pulang

1. Login pegawai yang sudah absen masuk.
2. Buka form **Absen Pulang**.
3. Pilih/ambil foto selfie pulang.
4. Isi keterangan jika diperlukan.
5. Centang **Absen lembur** jika pulang sebagai lembur.
6. Klik **Ambil GPS & Absen Pulang**.

Jika pulang sebelum 17:00 WITA, status otomatis menjadi `Pulang Cepat` atau `Terlambat dan Pulang Cepat`.

## Cara Tes Pengajuan

1. Login pegawai.
2. Buka form **Pengajuan**.
3. Pilih jenis:
   - Izin
   - Sakit
   - Cuti
   - Lembur
4. Isi tanggal mulai, tanggal selesai, alasan, dan bukti jika ada.
5. Klik **Kirim Pengajuan**.
6. Login admin.
7. Buka menu pengajuan sesuai jenis.
8. Klik **Setujui** atau **Tolak**.

Status pegawai akan terlihat sebagai:

- Menunggu
- Disetujui
- Ditolak

## Pengaturan Lokasi Absen

1. Login sebagai Super Admin.
2. Buka menu **Pengaturan Lokasi**.
3. Isi nama lokasi, latitude, longitude, dan radius meter.
4. Klik **Simpan Lokasi**.

Jika pegawai absen di luar radius, sistem memberi peringatan dan tetap menyimpan lokasi sebagai bukti.

## Mode Demo

Untuk mengetes tanpa Supabase:

```text
index.html?demo=1
```

Mode demo menyimpan data di browser lokal.

## Deploy

Aplikasi ini tetap statis dan bisa dipasang di:

- GitHub Pages
- Vercel

Tidak memerlukan backend Node.js karena semua operasi database memakai Supabase RPC dengan anon public key.
