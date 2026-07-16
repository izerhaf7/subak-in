# subakin — Struktur Project & Kontrak Backend↔Frontend (v2)
**Selaras dengan hasil scraping aktual (PIHPS + BPS + BMKG selesai, KATAM gugur)**

Perubahan besar dari v1:
1. **ZERO live call saat demo — termasuk BMKG.** Badge cuaca membaca dari cache
   `bmkg_prakiraan_cuaca.csv`, bukan API. Tidak ada fallback-toggle karena tidak ada live call
   sama sekali. (Requirement non-negotiable: wifi konferensi + semua server pemerintah.)
2. Nama file `data/raw/` disesuaikan dengan output scraper aktual.
3. Modul baru `aliases.py` — tiga sumber pakai kode wilayah BERBEDA (PIHPS internal ID, BPS
   kode sendiri, BMKG adm4 Kepmendagri + kode ZOM JABAR_XX). Join by name itu jebakan
   (trailing space, "Kota" vs "Kab."). Tabel alias eksplisit = pekerjaan nyata jam awal.
4. Fakta terkoreksi: bawang merah — **Kab. Bandung #1 (~44% produksi, NOL coverage PIHPS)**;
   PIHPS produsen menangkap ~35% (Cirebon #3 + Garut). Cabai besar: Garut #1 konsisten 2015–2024.
5. Luas panen cabai di BPS hanya GABUNGAN (rawit+besar); produksi bisa dipisah (turvar 159≈Rawit,
   169=Besar) → alokasi luas per varian = estimasi proporsional dari rasio produksi, dilabeli.
6. `bps_estimasi_unit_lahan.csv` (proxy Sensus Pertanian 2023) → angka funnel "Jangkauan" di
   Decision Brief sekarang pakai angka hasil hitung sendiri, bukan estimasi kasar.
7. Layar Simulasi Tanam fokus ke **6 kabupaten sentra ter-scrape**: Garut, Cirebon, Kab. Bandung,
   Sumedang, Tasikmalaya, Kota Sukabumi.

---

## 1. Struktur Repo

```
panen-radar/
├── README.md
├── data/
│   ├── raw/                          # HASIL SCRAPE AKTUAL (read-only, sudah ada)
│   │   ├── pihps/
│   │   │   ├── tier1_producer_prices.csv      # Cabai Rawit M/H + Bawang Merah, farm-gate
│   │   │   ├── tier2_producer_prices.csv      # Cabai Besar/Keriting (modeled)
│   │   │   ├── all_producer_prices.csv
│   │   │   ├── retail_overlay_prices.csv      # Pasar Tradisional (narasi sentra→kota)
│   │   │   ├── coverage_manifest.json         # measured_active/discontinued/no_data per kab×kom
│   │   │   └── refs.json
│   │   ├── bps/
│   │   │   ├── bps_production_data.csv                # 8 kab target
│   │   │   ├── bps_production_data_all_regencies.csv  # 27 kab
│   │   │   ├── bps_coverage_manifest.json
│   │   │   └── bps_estimasi_unit_lahan.csv            # proxy unit lahan (Sensus 2023)
│   │   └── bmkg/
│   │       ├── bmkg_prakiraan_cuaca.csv       # 6 kab sentra (kelurahan representatif)
│   │       ├── bmkg_zom_onset.csv             # final; kolom status_musim_hujan (3 nilai)
│   │       ├── bmkg_jabar_zom_kemarau2026_full.csv
│   │       ├── bmkg_jabar_zom_hujan2025_2026_full.csv
│   │       └── wilayah_kemendagri_2022.sql
│   └── curated/                      # kurasi manual M3
│       ├── absorbers.csv             # 10-20 pengolah/bank pangan riil
│       ├── crop_constants.json       # kernel panen per komoditas + SITASI (Balitsa/IPB)
│       ├── price_thresholds.json     # ongkos petik + biaya produksi + SITASI
│       └── region_aliases.csv        # ★ mapping PIHPS-id ↔ BPS-kode ↔ BMKG-adm ↔ id kanonik
│
├── model/                            # DUNIA M1 (Python)
│   ├── requirements.txt
│   ├── notebooks/
│   ├── src/
│   │   ├── aliases.py                # ★ BARU: load region_aliases.csv, satu id kanonik utk semua join
│   │   ├── ingest.py                 # baca+bersihkan 3 sumber via aliases; JANGAN join by name
│   │   ├── seasonality.py            # STL per kab-komoditas (data harian→mingguan)
│   │   ├── forecast.py               # Holt-Winters/SARIMA + rolling backtest → MAPE per kab
│   │   ├── supply.py                 # disagregasi BPS (alokasi varian proporsional, dilabeli)
│   │   │                             #   + window tanam dari zom_onset per status_musim_hujan
│   │   │                             #   + konvolusi kohort × kernel
│   │   ├── risk.py                   # Glut Risk Index; kalibrasi ke trough historis nyata
│   │   ├── dispatch.py               # pre-compute matching absorber per kabupaten
│   │   ├── weather.py                # ★ BARU: ringkas bmkg_prakiraan_cuaca.csv → badge + modifier
│   │   └── export.py                 # tulis semua JSON kontrak §3
│   └── run_all.py                    # python run_all.py → regen web/public/data/*
│
├── web/                              # DUNIA M2 (Vite + React JSX)
│   ├── public/
│   │   ├── data/                     # ★ OUTPUT M1 (kontrak §3) — SEMUA STATIS, NOL LIVE CALL
│   │   │   ├── meta.json
│   │   │   ├── map.json
│   │   │   ├── kabupaten/{id}.json
│   │   │   ├── simulasi.json
│   │   │   ├── absorbers.json
│   │   │   └── weather.json          # ← pengganti panggilan BMKG live (dari cache)
│   │   └── geo/jabar_kabupaten.svg.json
│   └── src/
│       ├── App.jsx
│       ├── lib/ (loadData.js, supplyMath.js, briefBuilder.js)
│       ├── screens/ (PetaRisiko.jsx, SimulasiTanam.jsx, DecisionBrief.jsx)
│       └── components/
│
└── pitch/ (deck/, demo_script.md, qa_bank.md)
```

**Aturan emas (tetap):** M1 hanya menulis `web/public/data/`; M2 hanya membaca. Perubahan bentuk
data = ubah kontrak dulu, sepakat berdua.

**Aturan emas baru:** `grep -r "api\.\|http" web/src/` menjelang freeze harus NOL hasil (kecuali
komentar). Kalau ada fetch ke luar → bug, bukan fitur.

---

## 2. Alur & Dependensi

```
data/raw (SUDAH ADA) ──┐
M3: curated (aliases, absorbers, constants) ──┼─► M1 run_all.py ─► public/data/*.json ─► M2
M3: geo SVG 27 kab ───────────────────────────┘
```

- **Blocker jam-0 yang baru:** `region_aliases.csv`. Tanpa ini `ingest.py` tidak bisa join 3 sumber
  dengan benar. M3 + M1 kerjakan BERSAMA di jam pertama (M1 dump daftar id unik per sumber, M3
  mencocokkan manual — 27 baris saja, 30-45 menit).
- M1 tetap commit **JSON dummy berskema benar** dalam jam pertama supaya M2 tidak menunggu.

---

## 3. KONTRAK JSON (revisi v2)

### 3.1 `meta.json`
```json
{
  "generated_at": "2026-07-17T02:00:00+07:00",
  "provinsi": "Jawa Barat",
  "minggu_berjalan": 29,
  "label_minggu": ["2026-W29", "…"],
  "komoditas": [
    {
      "id": "cabai_rawit",
      "nama": "Cabai Rawit",
      "tier": 1,
      "sumber_harga": "pihps_produsen",
      "ongkos_petik_rp": 2500,
      "biaya_produksi_rp": 12000,
      "sitasi_ambang": "…",
      "kernel_panen": { "semai_hari": 25, "mulai_panen_hari": 95,
                        "panjang_panen_minggu": 20, "bobot_mingguan": ["…Σ=1.0…"],
                        "sitasi": "Balitsa/IPB …" }
    },
    { "id": "bawang_merah", "tier": 1, "...": "..." },
    { "id": "cabai_besar", "tier": 2, "sumber_harga": null, "...": "..." }
  ],
  "catatan_coverage": {
    "bawang_merah": "PIHPS produsen menangkap ~35% produksi provinsi (Cirebon #3 + Garut); Kab. Bandung (#1, ~44%) nol coverage — blind spot yang ditampilkan eksplisit"
  }
}
```

### 3.2 `map.json`
Sama seperti v1, dengan dua ketentuan tambahan:
- `status_data` per kabupaten diisi LANGSUNG dari `coverage_manifest.json` PIHPS
  (`measured_active` → "measured"; `measured_discontinued` → "measured_stale" *(render: solid tapi
  ada ikon jam + tooltip "data harga berhenti [tahun]")*; `no_data` → "modeled").
- Kab. Bandung untuk bawang merah HARUS muncul menonjol sebagai modeled — ini bahan pitch, jangan
  disembunyikan oleh urutan render.

### 3.3 `kabupaten/{id}.json`
Sama seperti v1 (historis + forecast + MAPE + pasokan), plus satu blok opsional:
```json
"retail_overlay": [ {"minggu": "2026-W20", "rp": 45000}, "…" ]
```
Dari `retail_overlay_prices.csv` — untuk narasi "sinyal glut menjalar dari sentra ke kota"
(harga produsen jatuh duluan, eceran menyusul). Hanya untuk kabupaten/kota yang ada di overlay;
M2 render sebagai garis kedua tipis di chart forecast jika tersedia.

### 3.4 `simulasi.json`
Sama seperti v1 dengan penyesuaian:
- `kabupaten` = **6 sentra ter-scrape**: garut, cirebon, bandung_kab, sumedang, tasikmalaya,
  sukabumi_kota.
- Tambahan per kabupaten: `"status_musim_hujan"` (onset_diskrit / transisi_sebelum_cutoff /
  basah_kontinu) dan `"geser_maks_minggu"` diturunkan dari status itu (basah_kontinu → ruang geser
  paling besar; onset diskrit → dibatasi jendela musim).
- `test_vector` tetap WAJIB (verifikasi port konvolusi Python→JS).
- `"catatan_alokasi_luas": "luas per varian = estimasi proporsional dari rasio produksi (BPS hanya publish luas gabungan)"` — M2 menampilkan label kecil ini di layar Simulasi.

### 3.5 `absorbers.json`
Sama seperti v1. Keputusan v2 dikunci: **matching pre-computed oleh M1** (`dispatch.py`), field
`matches_per_kabupaten` disertakan. Browser hanya render.

### 3.6 `weather.json` — ★ menggantikan panggilan BMKG live
```json
{
  "sumber": "BMKG (cache scrape, bukan live)",
  "diambil_pada": "2026-07-16T20:00:00+07:00",
  "per_kabupaten": [
    { "id": "garut", "lokasi_sampel": "Cikajang",
      "ringkas_3hari": [ {"tanggal": "2026-07-17", "kondisi": "Cerah Berawan", "suhu_c": 24,
                          "hujan_flag": false} ],
      "risk_modifier": 0.0 }
  ]
}
```
- Dihasilkan `weather.py` dari `bmkg_prakiraan_cuaca.csv`.
- Badge top-bar menampilkan kondisi + **label eksplisit "per [tanggal scrape]"** — kejujuran
  bahwa ini cache, konsisten dengan prinsip measured-vs-modeled. TIDAK ada fetch ke api.bmkg.go.id
  dari frontend, titik.

### 3.7 Decision Brief (tetap dirakit di frontend)
Template hardcoded + slot angka; LLM opsional dengan fallback wajib. Tambahan v2: angka funnel
"Jangkauan" diambil dari **`bps_estimasi_unit_lahan.csv`** (via field baru di `meta.json`:
`"estimasi_unit_lahan_total"` + per kabupaten di `map.json`) — dengan caveat "estimasi berbasis
Sensus Pertanian 2023" di footnote brief. Angka sendiri > angka generik.

---

## 4. Brief per Anggota (delta dari v1 saja)

### M1 — Data & Model
- Mulai dari `aliases.py` + `region_aliases.csv` BERSAMA M3 (blocker semua join).
- `ingest.py`: waspada trailing-space & prefix "Kota/Kab." — normalisasi lewat tabel alias, bukan
  string cleaning ad-hoc.
- `supply.py`: window tanam per kabupaten dipilih berdasarkan `status_musim_hujan` (3 jalur logika,
  jangan satu rumus dipaksakan ke semua).
- `weather.py`: modul kecil baru, output `weather.json`.
- Backtest forecast: fokuskan klaim kuat di Tier-1; Tier-2 jangan diberi MAPE (tidak ada
  ground-truth farm-gate) — set `keyakinan: null`.

### M2 — Frontend
- HAPUS semua logika live-call + fallback-toggle dari rencana v1. `loadData.js` hanya fetch
  file statis dari `/data/` dan `/geo/`.
- Badge cuaca: render dari `weather.json` + label tanggal cache.
- Chart forecast: dukung garis `retail_overlay` opsional (garis kedua tipis).
- Definition of done v2: `npm run build && npm run preview` dengan **wifi dimatikan** — seluruh
  alur demo harus jalan sempurna.

### M3 — Kurasi, Pitch, QA
- Prioritas #1 jam pertama: `region_aliases.csv` bareng M1.
- `crop_constants.json` & `price_thresholds.json` + sitasi.
- QA baru: cek `map.json` — Kab. Bandung bawang merah harus "modeled" dan terlihat; cek tidak ada
  live call (`grep` §1); cek label cache di badge cuaca.
- `qa_bank.md`: tambah jawaban untuk "kenapa cuacanya bukan real-time?" → *"Keputusan desain:
  demo ini 100% offline-capable karena seluruh data pemerintah kami cache — di produksi, refresh
  harian otomatis."*

---

## 5. Checklist Kontrak v2 (cek sebelum jam 3)

- [ ] `region_aliases.csv` selesai & `ingest.py` join 3 sumber tanpa error
- [ ] JSON dummy berskema benar ter-commit; Peta Risiko M2 render darinya
- [ ] `status_data` 3-nilai (measured / measured_stale / modeled) disepakati render-nya
- [ ] Matching absorber = pre-compute M1 (dikunci, tidak dibahas ulang)
- [ ] `test_vector` konvolusi ada & M2 lolos verifikasi
- [ ] ZERO live call: grep bersih + uji demo dengan wifi mati
- [ ] Badge cuaca menampilkan tanggal cache
- [ ] Angka funnel Decision Brief dari `bps_estimasi_unit_lahan.csv`
- [ ] Tier-2 tanpa MAPE/keyakinan (null) — jangan pura-pura tervalidasi
- [ ] Blind spot Kab. Bandung terlihat di peta (bahan pitch, bukan aib)
