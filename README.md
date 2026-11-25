# Pustaka Mangrove ARK

Sistem literatur mangrove, terumbu karang, dan pesisir. Kode: AGPL-3.0. Data mengikuti lisensi sumbernya.
Tahap ini: basis data + pengambilan data harian. Rancangan lengkap ada di dokumen "Rancangan Sistem".

## Langkah 1. Repositori
1. Buka github.com, buat repositori **publik** bernama `pustaka-mangrove-ark`.
2. Unggah semua file folder ini (tombol Add file > Upload files).

## Langkah 2. Supabase (SUDAH SELESAI: proyek mbrthjiagigyqkftwsiy, tabel sudah terpasang)
Hanya perlu salin **service_role key** dari Project Settings > API untuk langkah 4.

(Rincian awal, tidak perlu diulang:)
1. supabase.com > New project, beri nama `pustaka-mangrove-ark`.
2. Buka SQL Editor, tempel isi `supabase/01_schema.sql`, tekan Run.
3. Buka Project Settings > API: salin **Project URL** dan **service_role key** (rahasia, jangan dibagikan).

## Langkah 3. OpenAlex
1. Buat akun gratis di openalex.org, ambil kunci API di pengaturan akun.

## Langkah 4. Rahasia di GitHub
Repositori > Settings > Secrets and variables > Actions > New repository secret, isi tiga nama ini:
`OPENALEX_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

## Langkah 5. Uji dulu (tanpa menulis)
Actions > "Ambil literatur harian" > Run workflow, biarkan `dry_run` = 1.
Lihat lognya: harus muncul jumlah karya dan satu contoh baris. Kirim log ke saya bila ada galat.

## Langkah 6. Jalankan sungguhan
Run workflow lagi dengan `dry_run` = 0. Lalu cek Supabase > Table Editor > `works`.
Setelah itu pengambilan berjalan otomatis tiap pukul 03:00 WIB.

## Yang belum terverifikasi (itulah gunanya uji di langkah 5)
- Nama filter tanggal `from_publication_date` dan kolom `primary_location.license` di OpenAlex.
- Biaya: pencarian OpenAlex $1 per 1.000 panggilan; jatah gratis $1/hari. Skrip ini maksimal sekitar 60 panggilan per hari.

## Tahap 2. Worker (situs + pencarian + asisten AI)
Isi folder `worker/`. Sebelum dipasang:
1. `worker/wrangler.jsonc` sudah berisi URL dan kunci anon proyek (aman dipublikasikan; service_role JANGAN).
2. Cloudflare dashboard > Workers & Pages > Create > hubungkan repositori GitHub, root directory `worker`.
3. Di Settings > Variables and Secrets tambahkan rahasia `SUPABASE_SERVICE_KEY`.
4. Buka alamat Worker, coba mode "Cari literatur", lalu "Tanya asisten".
Catatan: nama model AI (`AI_MODEL`) perlu dicek terhadap katalog Workers AI saat ini.
