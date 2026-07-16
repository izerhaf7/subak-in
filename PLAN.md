# Panen Radar — M1 (backend) rencana & status kerja

Dokumen kerja untuk lanjutan pengembangan `model/`. Baca `subakin-contract.md` untuk
kontrak JSON resmi, dan `CLAUDE.md` untuk ringkasan status proyek keseluruhan
(termasuk apa yang M2/M3 belum kerjakan). File ini fokus ke **riwayat teknis
model/risk engine** dan **PR terbuka** supaya agent berikutnya tidak perlu
menebak ulang alasan di balik desain saat ini.

## Arsitektur pipeline saat ini

```
data/raw/{pihps,bps,bmkg} → ingest.py → seasonality.py (weekly + STL)
                                      ↘ forecast.py (Holt-Winters + backtest MAPE)
data/curated/*.json,csv  → supply.py (luas alokasi + kohort tanam + konvolusi kernel,
                                       DI-ANCHOR ke STL price-trough week)
                          → risk.py (overlap × magnitude_factor, geometric-mean
                                       vs PriceGap, weather modifier)
                          → dispatch.py (haversine + skor absorber)
                          → weather.py (ringkas cuaca cache, zero live call)
run_all.py orchestrates semuanya → export.py menulis web/public/data/*.json
```

## Perubahan besar (kronologis, dalam sesi ini)

1. **Recovery data mentah** — `scrapper/*_data/` yang sempat hilang lewat `git reset`
   dipulihkan user; disalin ke `data/raw/{pihps,bps,bmkg}/` sesuai kontrak.
2. **`region_aliases.csv` dibangun dari data nyata** (27 baris) — ternyata PIHPS/BPS/BMKG
   sudah pakai string "Kab. X"/"Kota Y" identik, bukan skema ID berbeda seperti dugaan
   kontrak. Skema id: suffix `_kab`/`_kota` untuk 6 nama yang bentrok (Bandung, Bogor,
   Cirebon, Bekasi, Sukabumi, Tasikmalaya) — **beda dari contoh id di kontrak**
   (`cirebon`/`tasikmalaya` bare) - flagged, M2 perlu tahu.
3. **Pipeline M1 lengkap ditulis** (`aliases → ingest → seasonality/forecast →
   supply → risk → dispatch/weather → export → run_all`), diverifikasi ke data asli.
4. **Bug: forecast negatif pada seri stale.** `bandung_kota` (bawang_merah,
   cabai_besar) berhenti dikoleksi PIHPS sejak 2020, tapi forecast week-label pakai
   tanggal global → model diberi label "forecast 2026" padahal cuma dilatih data
   2018-2020 → ekstrapolasi ke negatif. **Fix**: `measured_stale` sekarang cuma
   tampilkan historis, tanpa forecast/MAPE/keyakinan. Plus floor `>=0` defensif di
   `forecast_with_interval()`.
5. **Bug: kabupaten modeled tidak punya file detail sama sekali.** Kab. Bandung
   (modeled di 3 komoditas) tidak dapat `kabupaten/*.json`, padahal `map.json` tetap
   menampilkannya → frontend akan 404 kalau user klik dia di peta. **Fix**: tulis
   file detail kalau ada harga ATAU pasokan (bukan cuma harga), `harga` dikosongkan
   jujur (bukan 404, bukan diproxy).
6. **Bug: overlap score scale-invariant.** `score_overlap` normalisasi ke rata-rata
   dirinya sendiri → kabupaten manapun dengan `status_musim_hujan` default yang sama
   dapat kurva risk IDENTIK terlepas dari skala produksi asli (ditemukan: ~20
   kabupaten flat `skor=100`, termasuk yang produksinya 0.0006% share provinsi).
   **Fix**: `risk.magnitude_factor(share_pct)` — skala overlap berdasar share produksi
   tahunan BPS asli, threshold 5% = bobot penuh.
7. **Bug konseptual: risk naik padahal harga masih tinggi** (ditemukan user langsung
   dari data). Root cause ganda:
   - **Composite risk pakai weighted-sum** (v1) → overlap tinggi + harga sehat tetap
     bisa menghasilkan skor tinggi, padahal harusnya rendah (supply-demand basic).
     **Fix v2**: `composite_risk()` sekarang **geometric mean** dari overlap & PriceGap
     (keduanya harus tinggi BERSAMAAN untuk skor tinggi), dengan fallback teredam untuk
     kasus harga jatuh tanpa sinyal supply.
   - **Timing overlap dan timing harga tidak selaras.** Model supply awalnya
     mengasumsikan puncak panen = "sekarang" (minggu 0), padahal cek historis
     menunjukkan minggu itu TIDAK konsisten dengan trough harga musiman asli.
     **Fix**: `seasonality.find_harvest_peak_week()` — ekstrak minggu ISO trough
     harga dari dekomposisi STL 8 tahun histori PIHPS, dipakai sebagai jangkar
     kalender di `supply.harvest_convolution()` (parameter `harvest_peak_week`)
     alih-alih asumsi "puncak = sekarang".
8. **Fitur baru: proxy eceran untuk kabupaten buta** — kabupaten `modeled` yang
   punya data `retail_overlay` (baik miliknya sendiri atau proxy dari kota pasangan
   via `KOTA_PROXY`) sekarang dapat estimasi rentang harga produsen (p25-p75) dari
   rasio transmisi eceran→produsen yang dihitung dari kabupaten measured lain.
   **Bug ditemukan+diperbaiki saat review**: implementasi awal fitur ini menimpa
   file yang sudah ditulis loop utama, MENGHAPUS `pasokan_mingguan` (regresi ulang
   bug #5, kena bandung_kab, bogor_kab, bekasi_kab, sukabumi_kab, tasikmalaya_kab).
   Sudah di-merge, bukan overwrite — diverifikasi `pasokan_mingguan` + `proxy_eceran`
   dua-duanya ada sekarang.
9. **Fitur baru: agregat pasokan provinsi** di `simulasi.json`
   (`pasokan_provinsi_baseline`, `permintaan_provinsi_mingguan_ton`) — jumlah kurva
   supply 27 kabupaten, supaya frontend bisa hitung efek pergeseran tanam SATU
   kabupaten terhadap agregat provinsi tanpa perlu Python.
10. **M2 (`web/src/`) ternyata SUDAH DIBANGUN** (oleh AI agent lain, di luar sesi
    ini) — CLAUDE.md sempat salah bilang "M2 belum ada sama sekali", sudah
    dikoreksi. Diverifikasi langsung: `npm test` 143/143 lolos (termasuk
    verifikasi port `convolveSingleCohort` JS vs `simulasi.json.test_vector`
    Python - cocok persis), `npm run build` sukses, zero live call (satu-satunya
    `fetch()` di `loadData.js` manggil `/data/*.json` lokal). Screens: PetaRisiko,
    SimulasiTanam, PanenDarurat (bukan DecisionBrief - lihat hutang teknis #8 baru).
    Geo SVG (`web/public/geo/jabar_kabupaten.svg.json`) juga sudah ada.
    **Ditemukan (belum diperbaiki, ditahan sengaja)**: `wilayah.js`'s `KOTA_IDS`
    kosong padahal komentarnya bilang harus cermin backend `KOTA_IDS` (9 kota)
    dan ada `KotaNotice.jsx` siap pakai. Coba isi -> 3 test di
    `pressureTest.test.jsx` gagal (test itu eksplisit "lists all 27 regions").
    Jadi kosong ini kemungkinan keputusan sadar, BUKAN saya putuskan sepihak -
    di-revert ke kosong. Lihat hutang teknis #1 (sudah ada sebelumnya, sekarang
    dengan info tambahan bahwa ini bukan cuma backend, frontend juga perlu
    diputuskan+test-nya diupdate bareng.

## Cara menjalankan

```bash
cd model
python run_all.py
```
Regenerasi total ~beberapa detik, tidak ada live call eksternal (weather.py baca
cache CSV, bukan API BMKG).

## Hutang teknis / belum selesai (prioritas menurun)

1. **Kota-exclusion setengah jalan di DUA sisi, saling kontradiksi.** Backend
   (`run_all.py` line ~383) cuma komentar "kota tidak dianalisis", belum
   diimplementasi (kota diproses identik kabupaten di semua tempat, tidak ada
   `status_data` khusus). Frontend (`web/src/lib/wilayah.js`) punya `KOTA_IDS`
   Set KOSONG + komentar yang bilang harus cermin backend, PLUS komponen
   `KotaNotice.jsx` yang sudah jadi tapi tidak pernah ke-trigger. TAPI 3 test di
   `pressureTest.test.jsx` eksplisit mengetes "ranked list lists all 27 regions"
   (termasuk kota) - jadi kosong ini mungkin sengaja. **Butuh keputusan produk
   dulu**: kota exclude atau tidak? Kalau exclude: isi `KOTA_IDS` di
   `wilayah.js` (9 kota, sama seperti `model/run_all.py`'s `KOTA_IDS`) DAN update
   3 test yang expect 27 jadi 18, DAN implementasikan exclusion beneran di
   backend juga (bukan cuma komentar). Kalau tidak exclude: hapus komentar
   menyesatkan di kedua file + putuskan nasib `KotaNotice.jsx` (dead code atau dipakai untuk hal lain).
2. **`CYCLES_PER_YEAR` (`supply.py`) masih tebakan tanpa sitasi** (cabai_rawit=2,
   bawang_merah=3, cabai_besar=2). Sekarang timing KALENDER-nya sudah benar (via STL
   anchor), tapi JUMLAH siklus per tahun ini masih pengaruhi bentuk/lebar kurva -
   perlu direview agronom (M3).
3. **`price_thresholds.json` `ongkos_petik_rp` masih placeholder tidak realistis.**
   `risk.py`'s `_calibration_check()` (`python model/src/risk.py`) mencetak
   PERINGATAN eksplisit: ambang ini TIDAK PERNAH tercapai di histori harga nyata
   (mis. cabai_rawit placeholder Rp2.500, harga terendah historis riil Rp7.500).
   Butuh angka sitasi asli dari M3 sebelum dipakai di pitch.
4. **`crop_constants.json` dan `absorbers.csv` masih placeholder berlabel** —
   `crop_constants.json`'s `sitasi` fields dan `absorbers.csv`'s `[PLACEHOLDER]`
   prefix bilang persis apa yang perlu diverifikasi/diganti M3.
5. **M2 (`web/src/`) SUDAH ADA** (dibangun agent lain) - koreksi dari draft
   sebelumnya yang bilang "belum ada". `simulasi.json.test_vector` vs
   `convolveSingleCohort` (JS) SUDAH diverifikasi cocok persis lewat
   `supplyMath.test.js`. Tidak perlu dikerjakan ulang.
6. **Deviasi id `region_aliases.csv` dari contoh kontrak** (poin 2 di atas) -
   SUDAH DICEK, frontend TIDAK hardcode id bare "cirebon"/"tasikmalaya" tanpa
   suffix. Aman.
7. **Median STL trough pakai `statistics.median()` yang membulatkan ke bawah**
   untuk jumlah data genap (mis. `[28,40,51,51]` → 45.5 → `int()` → 45, bukan
   dibulatkan). Minor, tidak mempengaruhi kebenaran hasil, tapi kurang presisi.
8. **Layar Decision Brief (kontrak §3.7) status tidak jelas.** Yang ada di
   `web/src/screens/` cuma PetaRisiko, SimulasiTanam, PanenDarurat (PanenDarurat
   = layar matching absorber, konsumsi `absorbers.json`+`map.json` - BUKAN
   Decision Brief). `briefBuilder.js` juga tidak ada di `lib/`. Perlu dicek ke
   pembuat M2: apa Decision Brief sengaja belum dikerjakan, atau ganti nama/digabung
   ke screen lain?

## Next steps yang disarankan (urut prioritas)

1. Putuskan status "kota" di peta (hutang teknis #1) — keputusan produk,
   perlu update backend DAN frontend (termasuk 3 test) bareng.
2. Cek status layar Decision Brief ke pembuat M2 (hutang teknis #8).
3. Minta M3 isi angka real untuk `price_thresholds.json` dan `crop_constants.json`
   (kalau tidak, jelaskan di pitch bahwa angka2 itu ilustratif).
4. Kalau ada waktu: validasi `CYCLES_PER_YEAR` terhadap pola musiman BPS
   (produksi bulanan kalau tersedia, atau minimal sanity-check lebar kurva kernel
   panen vs `panjang_panen_minggu` dari `crop_constants.json`).
