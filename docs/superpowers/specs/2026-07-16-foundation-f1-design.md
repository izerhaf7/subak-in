# Panen Radar — Fondasi Web + Layar F1 (Peta Risiko)

## Konteks

Sub-project pertama dari scope M2 (frontend) Panen Radar, lihat
`C:\Users\maste\Downloads\PANEN_RADAR_FRONTEND_HANDOFF.md` dan
`subakin-contract.md` di root repo untuk kontrak lengkap tim.

Scope frontend penuh = F1 (Peta Risiko) → F3 (Simulasi Tanam) → F4 (Panen
Darurat) + panel Fan-Out. **Spec ini HANYA mencakup fondasi proyek + F1** —
F3/F4 akan di-brainstorm terpisah setelah ini selesai & di-review.

**Kondisi kerja**: developer (pemilik repo) masih pemula di pemrograman.
Claude yang implementasi mayoritas kode, dipecah jadi chunk kecil, developer
review & bertanya tiap chunk sebelum lanjut. Satu bagian kecil (`riskColor.js`)
sengaja disisihkan sebagai fungsi murni tanpa JSX untuk dicoba developer
sendiri duluan, dengan spesifikasi jelas dan review dari Claude sesudahnya.

**Constraint waktu**: H-1/H-2 sebelum demo Garuda Hacks 7.0. Prioritas: F1
harus bisa jalan (`npm run build && npm run preview`, wifi mati) sebelum
waktu habis.

## Keputusan arsitektur

- **Vite + React, JSX murni** (bukan TypeScript) — sesuai kontrak tim.
- **Tanpa react-router, tanpa Context API** untuk sub-project ini. State
  (komoditas aktif, kabupaten terpilih) cukup `useState` di `App.jsx`,
  diturunkan lewat props. Alasan: YAGNI — F3/F4 belum digarap, menambah
  routing/Context sekarang cuma menambah konsep tanpa manfaat langsung, dan
  developer masih pemula. Refactor ke Context nanti kalau F3 benar-benar
  butuh state yang sama — biayanya kecil kalau ditunda.
- **Styling**: plain CSS dengan file token (`src/styles/tokens.css`) berisi
  custom properties (`--bg`, `--aksen`, dan turunan skala warna risiko).
  Tidak pakai Tailwind — menghindari satu lapis konsep tambahan (utility
  class vocabulary) buat pemula, dan token warna tim cuma 2 warna kunci jadi
  plain CSS cukup.
- **Peta = SVG inline**, bukan Leaflet/Mapbox (kontrak tim, demi offline &
  kontrol visual). Data geometri kabupaten (`web/public/geo/jabar_kabupaten.svg.json`)
  **belum ada di repo**.

  **Update (2026-07-16, setelah spec ini ditulis)**: ketemu
  `data/curated/region_aliases.csv` (output M1, 27 baris, sudah punya `id`,
  `nama_resmi`, dan centroid `lat`/`lng` per kabupaten). Diputuskan bersama
  developer: **bangun geometri sebagai diagram Voronoi dari 27 centroid itu**
  (`d3-delaunay`, build-time only), bukan sourcing dataset batas
  administratif eksternal — nol resiko lisensi/data-tidak-ketemu/nama-tidak-
  cocok (ada 6 pasang nama kembar Kab./Kota yang rawan mismatch), dan bisa
  selesai dalam hitungan menit karena semua input sudah ada di repo. Trade-
  off: bentuk sel gak 100% sama persis batas administratif asli, tapi tetap
  terlihat sebagai peta wilayah yang masuk akal dan tetap bisa diklik per
  kabupaten.

  **Update kedua (2026-07-16, sesudahnya)**: developer melihat hasil Voronoi
  di browser dan menilai gak cukup bagus (gak kebentuk kayak Jawa Barat).
  Setelah jaringan yang tadinya bermasalah pulih, diputuskan pindah ke
  **geometri kabupaten/kota asli** — GADM-derived GeoJSON dari repo publik
  `mahendrayudha/indonesia-geojson`, disederhanakan pakai Douglas-Peucker.
  Dataset itu mendahului pemekaran Pangandaran (2012) dari Ciamis, jadi
  Ciamis di-split manual jadi dua pakai perpendicular bisector antar
  centroid Ciamis/Pangandaran. Waduk Cirata (reservoir, bukan kabupaten)
  dirender terpisah sebagai badan air non-interaktif, bukan di-skip (kalau
  di-skip meninggalkan lubang di peta). Detail implementasi final ada di
  `scripts/geo/generate.mjs` — source GeoJSON mentah gitignored, ada
  `scripts/geo/source/README.md` buat cara re-download.

## Temuan penting dari data nyata (M1 output, sudah ada di `web/public/data/`)

- Data terpecah **per komoditas**: `map.json` (cabai_rawit, default),
  `map_bawang_merah.json`, `map_cabai_besar.json`. Begitu juga file
  kabupaten detail: `bandung_kota.json` (default) vs
  `bandung_kota__bawang_merah.json` / `bandung_kota__cabai_besar.json`.
  → **F1 wajib punya pemilih komoditas** (3 opsi), bukan cuma render satu
  komoditas.
- `map.json` per kabupaten: `id`, `nama`, `status_data`
  (`measured` / `measured_stale` / `modeled`), `risk_mingguan` (array
  `{minggu, skor}` 0–100 untuk 16 minggu ke depan), `kpi.risk_puncak`,
  `kpi.minggu_puncak`, `kpi.harga_proyeksi_puncak_rp` (bisa `null`),
  `estimasi_unit_lahan` (bisa `null`).
- `kabupaten/{id}[__komoditas].json`: `harga.historis` (array
  `{minggu: "YYYY-Www", rp}`, bisa 8 tahun), `harga.forecast` (array
  `{minggu, rp, lo, hi}` — band ketidakpastian), `pasokan_mingguan`
  (`{minggu, ton}`), `retail_overlay` opsional (`{minggu, rp}` — garis
  eceran kedua, cuma ada untuk kabupaten tertentu).
- `meta.json`: `label_minggu` (16 minggu ke depan format `2026-W30`...),
  `minggu_berjalan` (29), daftar `komoditas` dengan `catatan_coverage`
  (blind-spot notes, mis. Kab. Bandung untuk bawang merah **harus** tampil
  menonjol sebagai `"modeled"` — bahan pitch).

## Struktur folder

```
web/
├── package.json, vite.config.js, index.html
├── public/
│   ├── data/                          (sudah ada — output M1)
│   └── geo/jabar_kabupaten.svg.json   (BARU — di-generate Claude)
└── src/
    ├── main.jsx
    ├── App.jsx                 (state: komoditasAktif, kabupatenTerpilih)
    ├── styles/tokens.css       (bg #eeece6, aksen #8a3f28 + skala warna risiko)
    ├── lib/
    │   ├── loadData.js         (loadMeta, loadMap(komoditasId), loadKabupaten(id, komoditasId))
    │   └── riskColor.js        (fungsi murni: skor 0-100 → warna — TASK DEVELOPER)
    ├── screens/
    │   └── PetaRisiko.jsx      (layar F1: rakit semua komponen di bawah)
    └── components/
        ├── KomoditasSwitcher.jsx
        ├── JabarMap.jsx        (27 <path>, warna dari riskColor, onClick → set kabupatenTerpilih)
        ├── StatusBadge.jsx     (badge measured/measured_stale/modeled)
        └── KabupatenPanel.jsx  (Recharts: historis+forecast+band lo/hi, retail_overlay kalau ada)
```

## Data flow

1. Mount `App` → `loadMeta()` sekali → simpan `label_minggu`,
   `minggu_berjalan`, daftar komoditas, `catatan_coverage`.
2. `komoditasAktif` berubah (default `cabai_rawit`) → `loadMap(komoditasId)`
   → `JabarMap` render, tiap kabupaten diwarnai pakai `skor` pada minggu
   `minggu_berjalan` (minggu 29) dari `risk_mingguan`.
3. Klik kabupaten di peta → set `kabupatenTerpilih` → `loadKabupaten(id,
   komoditasId)` → `KabupatenPanel` muncul di samping, chart historis +
   forecast (dengan band `lo`/`hi`) + `retail_overlay` sebagai garis tipis
   kedua kalau field itu ada.

## Error handling

Semua data statis lokal (zero live call, golden rule tim) — kegagalan cuma
mungkin kalau file JSON hilang/rusak. `loadData.js` tetap membungkus fetch
dengan try/catch dan mengembalikan state error eksplisit yang dirender
sebagai pesan ("data tidak tersedia"), bukan crash blank-screen. Konsisten
dengan prinsip tim: sistem menampilkan state jujur, termasuk kegagalan.

## Testing

- `riskColor.js`: fungsi murni, gampang dites manual (beberapa contoh
  input→output skor 0/50/100 dicek langsung di browser console atau via
  `console.log` sementara). Ini juga task pertama developer — dites tanpa
  perlu setup test runner dulu, biar tidak menambah beban di H-1.
- QA manual sebelum dianggap selesai: klik tiap kabupaten (termasuk yang
  `modeled`), ganti-ganti komoditas, cek `Kab. Bandung` + bawang merah
  tampil `modeled` menonjol, jalankan `grep -r "api\.\|http" web/src/` harus
  nol hasil, `npm run build && npm run preview` jalan dengan wifi mati.

## Di luar scope sub-project ini

F3 (Simulasi Tanam), F4 (Panen Darurat), panel Fan-Out, badge cuaca,
Decision Brief, `supplyMath.js`, `briefBuilder.js` — semua di-brainstorm
sebagai spec terpisah setelah fondasi + F1 ini selesai dan sudah di-review.
