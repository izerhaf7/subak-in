# Changelog — Panen Radar Model Fixes

> Sesi: 2026-07-17 | Semua perubahan di `model/src/` dan `model/run_all.py`

---

## Bug Fix 1 — Timing Panen Salah ~11 Minggu

**Files:** `model/src/seasonality.py`, `model/src/supply.py`

### Masalah
`harvest_convolution()` menempatkan puncak supply di week 0 ("sekarang", W29) tanpa anchor
kalender. Akibatnya model bilang panen Garut puncak di Juli, padahal data harga nyata
8 tahun menunjukkan trough harga (= panen raya sebenarnya) di **W40 (Oktober)** — selisih ~11 minggu.

### Fix
- Tambah `find_harvest_peak_week()` di `seasonality.py`: membaca harga historis PIHPS,
  jalankan STL decomposition, kembalikan ISO week dimana komponen seasonal paling rendah
  (= price trough = proxy puncak glut nyata).
- Refactor `harvest_convolution()` di `supply.py`: terima parameter `harvest_peak_week`
  (ISO week dari STL), gunakan sebagai anchor kalender sehingga puncak supply model
  jatuh di minggu yang secara historis memang trough harga.
- `supply_weekly_ton()` ikut diupdate untuk pass `harvest_peak_week`.
- Tambah `baseline_tanam_minggu_dari_trough()`: hitung ISO week tanam baseline dari
  harvest peak week (mundur `mulai_panen_hari / 7` minggu).

### Hasil
| Kabupaten | Peak Risk Sebelum | Peak Risk Sesudah |
|-----------|-------------------|-------------------|
| Garut | W29 (Juli, salah) | **W41 (Oktober, sesuai STL)** |
| Semua modeled | W29 (sama persis) | W43 (berbeda timing per kabupaten) |

---

## Bug Fix 2 — Risk Tinggi Padahal Harga Bagus

**File:** `model/src/risk.py`

### Masalah
Formula composite risk lama (additive):
```
risk = 0.35 × overlap + 0.65 × price_gap
```
Memungkinkan kombinasi tidak masuk akal secara ekonomi:
- Supply banyak + harga **sehat** → risk **tinggi** ❌
- Supply nol + harga jatuh → risk **tinggi** ❌

### Fix
Ganti ke **geometric mean (multiplicative)**:
```
risk = 0.7 × √(overlap × price_gap) + 0.3 × price_gap_redup
```

Truth table baru:

| Overlap | Price Gap | Risk | Keterangan |
|---------|-----------|------|------------|
| Tinggi | Tinggi | **Tinggi** | ✅ Glut nyata |
| Tinggi | Rendah | **Rendah** | ✅ Supply banyak tapi harga bagus |
| Rendah | Tinggi | **Sedang** | ✅ Harga jatuh bukan karena panen |
| Rendah | Rendah | **Rendah** | ✅ Normal |

Komponen `0.3 × price_gap_redup` dipertahankan agar price crash ekstrem
(tanpa supply signal, misal gagal panen massal lalu oversupply dari luar)
tetap terbaca.

Kabupaten **modeled** (tanpa data harga PIHPS) tetap pakai overlap-only — tidak berubah.

### Hasil
```
Kabupaten dengan risk=100 di W29: 20 → 0
Garut W29-31: risk 32-35 → 0   (harga masih sehat, harusnya memang 0)
Garut W37-41: risk 10-19 → 27-33  (mendekati trough harga, harusnya tinggi)
```

---

## Fix 3 — Simulasi Tanam Tanpa Referensi Jadwal

**Files:** `model/src/supply.py`, `model/run_all.py` → `web/public/data/simulasi.json`

### Masalah
Slider geser tanam di layar Simulasi Tanam tidak punya referensi "kapan biasanya petani
tanam". Pengguna tidak tahu apakah mereka sedang bergeser maju atau mundur dari baseline.

### Fix
Tambah field baru per sentra di `simulasi.json`:
```json
{
  "harvest_peak_week_iso": 40,
  "baseline_tanam_minggu": 26
}
```
- `harvest_peak_week_iso`: ISO week puncak panen (dari STL price trough)
- `baseline_tanam_minggu`: ISO week tanam baseline (= harvest_peak - mulai_panen/7)

### Hasil (6 sentra)
| Kabupaten | Harvest Peak | Baseline Tanam |
|-----------|-------------|----------------|
| Garut | W40 | W26 (akhir Juni) |
| Cirebon Kab | W51 | W37 (September) |
| Bandung Kab | W45 | W31 (awal Agustus) |
| Sumedang | W45 | W31 |
| Tasikmalaya Kab | W51 | W37 |
| Sukabumi Kota | W28 | W14 (April) |

---

## Fitur Baru — Provincial Aggregate Supply

**Files:** `model/run_all.py`, `model/src/export.py` → `web/public/data/simulasi.json`

### Latar Belakang
Glut terjadi di level pasar provinsi, bukan per-kabupaten. Harga farm-gate jatuh karena
semua sentra masuk ke rantai distribusi yang sama secara bersamaan. Simulasi staggering
per-kabupaten tidak bermakna tanpa menunjukkan dampaknya ke agregat provinsi.

### Apa yang Ditambahkan
`simulasi.json` sekarang punya:

```json
{
  "pasokan_provinsi_baseline": {
    "ton_per_minggu": [1500.0, 1025.9, ..., 6267.3]
  },
  "permintaan_provinsi_mingguan_ton": 3149.2,
  "kabupaten": [
    {
      "pasokan_baseline_ton": [6.1, 0.0, ..., 2043.6]
    }
  ]
}
```

- `pasokan_provinsi_baseline.ton_per_minggu`: kurva supply 16 minggu dari **semua 27 kabupaten** dijumlah pada jadwal tanam baseline
- `permintaan_provinsi_mingguan_ton`: proxy demand provinsi (total produksi tahunan / 52 = **3.149 ton/minggu**)
- `pasokan_baseline_ton` per sentra: kontribusi individual, sehingga frontend bisa hitung simulasi tanpa round-trip ke Python

### Cara Frontend Pakai Data Ini
```js
// Ketika user menggeser jadwal tanam satu kabupaten:
const kurvaProvinsi_baru =
    pasokan_provinsi_baseline.ton_per_minggu
    .map((v, i) => v
        - kabupaten.pasokan_baseline_ton[i]          // kurangi kontribusi lama
        + convolve_single_cohort(kohort_digeser)[i]  // tambah kontribusi baru
    );
```

### Temuan dari Data
Garut dan Bandung Kab keduanya panen raya di W43-44, masing-masing menyumbang
~2.000-2.500 ton/minggu. Total provinsi di puncak = **6.267 ton/minggu** vs demand **3.149 ton/minggu** → oversupply **2× lipat**. Ini yang bikin harga crash — dan sekarang bisa divisualisasikan.

---

## Ringkasan Perubahan Output JSON

| File | Status Skema | Yang Berubah |
|------|-------------|--------------|
| `map.json` | ✅ Tidak berubah | Nilai `risk_mingguan` dan `risk_puncak` lebih akurat |
| `map_bawang_merah.json` | ✅ Tidak berubah | Nilai skor diperbarui |
| `map_cabai_besar.json` | ✅ Tidak berubah | Nilai skor diperbarui |
| `kabupaten/*.json` | ✅ Tidak berubah | `pasokan_mingguan` timing lebih akurat |
| `simulasi.json` | ➕ 4 field baru (aditif, backward-compatible) | `harvest_peak_week_iso`, `baseline_tanam_minggu`, `pasokan_baseline_ton`, `pasokan_provinsi_baseline`, `permintaan_provinsi_mingguan_ton` |
| `meta.json`, `weather.json`, `absorbers.json` | ✅ Tidak berubah | — |

---

## Files yang Dimodifikasi

| File | Jenis Perubahan |
|------|----------------|
| `model/src/seasonality.py` | + `find_harvest_peak_week()` |
| `model/src/supply.py` | Refactor `harvest_convolution()` + anchor kalender + `baseline_tanam_minggu_dari_trough()` |
| `model/src/risk.py` | Redesign `composite_risk()` → multiplicative gating + update docstring |
| `model/src/export.py` | Update `build_simulasi()` signature + field baru provincial aggregate |
| `model/run_all.py` | Wire STL trough, provincial aggregate, per-sentra baseline supply |
