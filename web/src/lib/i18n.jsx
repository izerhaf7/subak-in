import { createContext, useContext } from "react";

// Two-language dictionary. Data that comes from the backend JSON (coverage
// notes, absorber names, commodity names) stays in Indonesian — this covers
// the interface chrome. Commodity names are treated as proper nouns and not
// translated.
const STRINGS = {
  id: {
    product: "Panen Radar",
    nav_peta: "Peta Risiko",
    nav_simulasi: "Simulasi Tanam",
    nav_darurat: "Panen Darurat",
    loading: "Memuat...",
    loading_map: "Memuat peta...",
    loading_sim: "Memuat simulasi...",
    load_error: "Gagal memuat data: {msg}",
    topbar_week: "{prov} — minggu berjalan {n}",
    weather_badge: "BMKG per {date} · {rain}/{total} sentra potensi hujan",
    kpi_top_risk: "Risiko tertinggi",
    kpi_index: "Indeks {n}",
    kpi_peak_price: "Proyeksi harga saat puncak",
    kpi_no_data: "Data belum tersedia",
    kpi_peak_week: "Minggu ke puncak",
    now: "Sekarang",
    week_n: "Minggu {n}",
    map_title: "Indeks risiko panen raya — per kabupaten",
    legend: "Indeks risiko:",
    ranking_title: "Ranking risiko",
    detail_title: "Detail kabupaten",
    back_ranking: "← Kembali ke ranking",
    coverage_fallback:
      "PIHPS produsen punya data harga terukur untuk {m} dari 27 kabupaten/kota — sisanya ditampilkan sebagai estimasi model, bukan disembunyikan.",
    badge_measured: "Terukur",
    badge_stale: "Data berhenti",
    badge_modeled: "Estimasi model",
    last_measured: "Harga terukur terakhir ({w})",
    peak_projection: "Proyeksi puncak ({w})",
    blind_spot:
      "Belum ada data harga terukur untuk {nama} pada komoditas ini — PIHPS tidak mencatat produsen di kabupaten ini. Peta tetap menampilkan estimasi model, bukan menyembunyikannya, supaya blind spot ini kelihatan apa adanya.",
    stale_note:
      "Pengumpulan harga PIHPS untuk seri ini sudah berhenti — grafik hanya menampilkan riwayat, tanpa proyeksi, karena memproyeksikan data selama itu ke pasar hari ini akan menyesatkan.",
    timeline_title: "Garis waktu risiko",
    timeline_this_week: "Minggu ini",
    timeline_pick: "Pilih minggu",
    timeline_end: "+{n} minggu",
    map_aria: "Peta risiko panen raya Jawa Barat",
    map_region_title: "{nama} — indeks {skor}",
    sim_peak_before: "Puncak pasokan sebelum",
    sim_peak_after: "Puncak pasokan sesudah",
    sim_peak_drop: "Penurunan puncak",
    sim_supply_chart: "Pasokan mingguan (ton) — sebelum vs sesudah",
    sim_price_chart: "Proyeksi harga (Rp/kg) — sebelum vs sesudah",
    before: "Sebelum",
    after: "Sesudah",
    sim_sliders_title: "Geser jadwal tanam",
    reset_all: "↺ Reset semua",
    plus_weeks: "+{n} minggu",
    status_onset_diskrit: "Onset diskrit — jendela geser sempit",
    status_transisi_sebelum_cutoff: "Transisi sebelum cutoff",
    status_basah_kontinu: "Basah kontinu — ruang geser paling besar",
    sim_area_note:
      "luas per varian = estimasi proporsional dari rasio produksi (BPS hanya publish luas gabungan)",
    dar_placeholder_note:
      "Daftar absorber di bawah ini masih data placeholder ([PLACEHOLDER] di nama) — direktori final menunggu kurasi tim. Matching jarak/skor sudah precompute di backend, bukan dihitung ulang di sini.",
    dar_surplus: "Kabupaten surplus",
    dar_matched: "Absorber tercocok",
    dar_best: "Match terbaik",
    dar_nearest: "Absorber terdekat untuk {nama}",
    dar_none: "Belum ada absorber yang cocok untuk kabupaten ini.",
    th_name: "Nama",
    th_type: "Jenis",
    th_dist: "Jarak",
    th_cap: "Kapasitas",
    th_offer: "Harga tawar",
    th_diff: "Selisih vs pasar",
    th_uplift: "Estimasi uplift",
    juta: "juta",
    dar_pick: "Pilih kabupaten",
    dar_pick_hint: "Angka = jumlah absorber yang cocok",
    map_hint: "Klik wilayah pada peta atau daftar ranking untuk melihat detail",
    kota_status: "Tidak dianalisis",
    kota_notice:
      "{nama} adalah wilayah kota — bukan wilayah produksi hortikultura, jadi tidak ikut dianalisis di peta risiko. Data harga eceran dari kota justru dipakai sebagai sinyal proxy untuk kabupaten di sekitarnya.",
    proxy_caption:
      "Kabupaten ini tidak punya data harga produsen. Garis di bawah adalah harga eceran {sumber} (data asli), dan pita adalah rentang estimasi harga produsen (rasio transmisi p25–p75) — estimasi tidak langsung, BUKAN harga terukur.",
    proxy_band_label: "Rentang estimasi produsen",
    retail_line_label: "Harga eceran {sumber}",
  },
  en: {
    product: "Panen Radar",
    nav_peta: "Risk Map",
    nav_simulasi: "Planting Simulator",
    nav_darurat: "Emergency Harvest",
    loading: "Loading...",
    loading_map: "Loading map...",
    loading_sim: "Loading simulator...",
    load_error: "Failed to load data: {msg}",
    topbar_week: "{prov} — current week {n}",
    weather_badge: "BMKG as of {date} · {rain}/{total} hubs may see rain",
    kpi_top_risk: "Highest risk",
    kpi_index: "Index {n}",
    kpi_peak_price: "Projected price at peak",
    kpi_no_data: "Not yet available",
    kpi_peak_week: "Peak week",
    now: "Now",
    week_n: "Week {n}",
    map_title: "Harvest-glut risk index — by regency",
    legend: "Risk index:",
    ranking_title: "Risk ranking",
    detail_title: "Regency detail",
    back_ranking: "← Back to ranking",
    coverage_fallback:
      "Official producer prices (PIHPS) cover {m} of 27 regencies/cities — the rest are shown as model estimates, not hidden.",
    badge_measured: "Measured",
    badge_stale: "Data discontinued",
    badge_modeled: "Model estimate",
    last_measured: "Last measured price ({w})",
    peak_projection: "Peak projection ({w})",
    blind_spot:
      "No measured price data exists for {nama} on this commodity — PIHPS does not track producers here. The map still shows the model estimate rather than hiding it, so this blind spot stays visible.",
    stale_note:
      "PIHPS stopped collecting prices for this series — the chart shows history only, with no projection, because projecting data that old onto today's market would be misleading.",
    timeline_title: "Risk timeline",
    timeline_this_week: "This week",
    timeline_pick: "Select week",
    timeline_end: "+{n} weeks",
    map_aria: "West Java harvest-glut risk map",
    map_region_title: "{nama} — index {skor}",
    sim_peak_before: "Peak supply before",
    sim_peak_after: "Peak supply after",
    sim_peak_drop: "Peak reduction",
    sim_supply_chart: "Weekly supply (tonnes) — before vs after",
    sim_price_chart: "Projected price (Rp/kg) — before vs after",
    before: "Before",
    after: "After",
    sim_sliders_title: "Shift planting schedule",
    reset_all: "↺ Reset all",
    plus_weeks: "+{n} weeks",
    status_onset_diskrit: "Discrete onset — narrow shift window",
    status_transisi_sebelum_cutoff: "Transition before cutoff",
    status_basah_kontinu: "Continuously wet — widest shift window",
    sim_area_note:
      "area per variant is a proportional estimate from production ratios (BPS only publishes the combined area)",
    dar_placeholder_note:
      "The absorbers below are still placeholder data ([PLACEHOLDER] in the name) — the final directory awaits team curation. Distance/score matching is precomputed in the backend, not recalculated here.",
    dar_surplus: "Surplus regency",
    dar_matched: "Matched absorbers",
    dar_best: "Best match",
    dar_nearest: "Nearest absorbers for {nama}",
    dar_none: "No matching absorbers for this regency yet.",
    th_name: "Name",
    th_type: "Type",
    th_dist: "Distance",
    th_cap: "Capacity",
    th_offer: "Offer price",
    th_diff: "Diff vs market",
    th_uplift: "Estimated uplift",
    juta: "million",
    dar_pick: "Select regency",
    dar_pick_hint: "Number = matching absorbers",
    map_hint: "Click a region on the map or in the ranking list to see details",
    kota_status: "Not analysed",
    kota_notice:
      "{nama} is a city — not a horticulture production area, so it is excluded from the risk map analysis. Its retail price data is instead used as a proxy signal for the surrounding regencies.",
    proxy_caption:
      "This regency has no producer price data. The line below is {sumber} retail prices (real data), and the band is an estimated producer price range (p25–p75 transmission ratio) — an indirect estimate, NOT a measured price.",
    proxy_band_label: "Estimated producer range",
    retail_line_label: "{sumber} retail price",
  },
};

// Absorber jenis values live in the backend data in Indonesian; this maps
// them for display in English mode only (Indonesian mode shows them raw).
const JENIS_EN = {
  Pengolah: "Processor",
  "Bank Pangan": "Food bank",
  Koperasi: "Cooperative",
  "Pasar Modern": "Modern retail",
};

export const LangContext = createContext({ lang: "id", setLang: () => {} });

function format(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? vars[key] : m));
}

export function useT() {
  const { lang } = useContext(LangContext);
  const t = (key, vars) => {
    const template = STRINGS[lang]?.[key] ?? STRINGS.id[key] ?? key;
    return format(template, vars);
  };
  return { t, lang };
}

export function translateJenis(jenis, lang) {
  if (lang === "en") return JENIS_EN[jenis] ?? jenis;
  return jenis;
}
