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
    sidebar_collapse: "Ciutkan sidebar",
    sidebar_expand: "Perluas sidebar",
    loading: "Memuat...",
    loading_map: "Memuat peta...",
    loading_sim: "Memuat simulasi...",
    load_error: "Gagal memuat data: {msg}",
    topbar_week: "{prov} — Minggu ke {n}",
    weather_badge: "BMKG per {date} · {rain}/{total} sentra berpotensi hujan",
    kpi_top_risk: "Risiko tertinggi",
    kpi_index: "Indeks {n}",
    kpi_peak_price: "Harga terendah saat panen raya",
    kpi_no_data: "Data belum tersedia",
    kpi_peak_price_floor_note: "Estimasi tingkat provinsi",
    kpi_peak_week: "Minggu panen raya",
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
    peak_projection: "Proyeksi harga tertinggi ({w})",
    blind_spot:
      "Belum ada data harga terukur untuk {nama} pada komoditas ini — PIHPS tidak mencatat produsen di kabupaten ini. Peta tetap menampilkan estimasi model, bukan menyembunyikannya, supaya titik buta data ini kelihatan apa adanya.",
    stale_note:
      "Pengumpulan harga PIHPS untuk seri ini sudah berhenti — grafik hanya menampilkan riwayat, tanpa proyeksi, karena memproyeksikan data setua itu ke pasar hari ini bisa menyesatkan.",
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
    status_onset_diskrit: "Awal musim hujan jelas — ruang geser sempit",
    status_transisi_sebelum_cutoff: "Masa transisi — ruang geser sedang",
    status_basah_kontinu: "Musim basah terus-menerus — ruang geser paling besar",
    sim_area_note:
      "luas per varian = estimasi proporsional dari rasio produksi (BPS hanya merilis luas gabungan)",
    dar_placeholder_note:
      "Absorber di bawah ini organisasi nyata hasil riset publik (nama & lokasi terverifikasi) — tapi kapasitas & harga tawar masih angka ilustratif, belum dikonfirmasi langsung ke organisasinya. Jarak dan skor kecocokannya sudah dihitung otomatis di sistem, bukan dihitung ulang di sini.",
    dar_surplus: "Kabupaten surplus",
    dar_matched: "Absorber yang cocok",
    dar_best: "Kecocokan terbaik",
    dar_nearest: "Absorber terdekat untuk {nama}",
    dar_none: "Belum ada absorber yang cocok untuk kabupaten ini.",
    th_name: "Nama",
    th_type: "Jenis",
    th_dist: "Jarak",
    th_cap: "Kapasitas",
    th_offer: "Harga tawar",
    th_diff: "Selisih vs pasar",
    th_uplift: "Estimasi kenaikan harga",
    juta: "juta",
    dar_pick: "Pilih kabupaten",
    dar_pick_hint: "Angka = jumlah absorber yang cocok",
    map_hint: "Klik wilayah pada peta atau daftar ranking untuk melihat detail",
    map_hint_sim: "Klik wilayah untuk detail — klik sentra (garis tebal saat dipilih) untuk mensimulasikan jadwal tanam",
    kota_status: "Tidak dianalisis",
    kota_notice:
      "{nama} adalah wilayah kota — bukan wilayah produksi hortikultura, jadi tidak ikut dianalisis di peta risiko. Data harga eceran dari kota justru dipakai sebagai sinyal proxy untuk kabupaten di sekitarnya.",
    proxy_caption:
      "Tidak ada data harga produsen di sini. Pita/garis tebal = estimasi harga yang diterima petani (bukan angka terukur). Garis putus-putus tipis = harga eceran {sumber}, sumber datanya — bukan harga yang diterima petani.",
    proxy_band_label: "Estimasi harga produsen",
    retail_line_label: "Harga eceran {sumber} (referensi)",
    nav_peta_simulasi: "Peta & Simulasi",
    band_tanam: "Waktu Tanam",
    band_panen: "Panen Raya",
    popup_close: "✕ Tutup",
    popup_baseline: "Tanam biasanya mulai minggu W{w}",
    popup_no_shift: "Tidak digeser (tanam W{w})",
    popup_slider_aria: "Geser jadwal tanam — {nama}",
    popup_hint: "Geser slider untuk menunda tanam beberapa minggu dan lihat efeknya di panel hasil simulasi.",
    popup_not_sentra: "Kabupaten ini belum termasuk sentra yang datanya lengkap untuk simulasi tanam — belum ada jadwal tanam yang bisa disimulasikan di sini.",
    popup_zom_generik: "⚠ Kabupaten ini belum punya data awal musim hujan BMKG — jadwal tanam di atas dimodelkan mendekati kondisi asli (asumsi musim generik), akan disempurnakan saat data lengkap tersedia.",
    hasil_simulasi_title: "Hasil simulasi tanam",
    hasil_simulasi_note:
      "Kurva menunjukkan dampak provinsi dari jadwal tanam yang digeser terhadap kurva tanpa perubahan (kondisi awal). Indeks risiko kabupaten ini sendiri di peta tetap mengikuti minggu panennya yang baru — bukan hilang, hanya pindah minggu. Yang membaik di sini adalah sebaran beban panen di level provinsi, sehingga harga tidak jatuh sedalam skenario tanpa staggering.",
    laporan_buat: "Buat Laporan",
    laporan_membuat: "Menyiapkan...",
    laporan_preview_title: "Pratinjau Laporan",
    laporan_kembali: "← Kembali",
    laporan_export: "Export PDF",
    laporan_exporting: "Membuat PDF...",
    laporan_export_error: "Gagal membuat PDF. Coba lagi.",
    laporan_generated_at: "Dibuat {tanggal}",
    laporan_no_kabupaten_hint: "Belum ada kabupaten dipilih — laporan ini ringkasan tingkat provinsi.",
    laporan_section_risiko: "Ringkasan Risiko & Tren",
    laporan_section_kualitas: "Catatan Kualitas Data",
    laporan_section_simulasi: "Hasil Simulasi Geser Tanam",
    laporan_skor_sekarang: "Skor risiko minggu ini",
    laporan_top_ranking_title: "Top 5 Kabupaten Berisiko",
    laporan_coverage_title: "Cakupan Data",
    laporan_geser_label: "Jadwal tanam digeser",
    laporan_harga_dasar: "Harga dasar",
    laporan_footer_disclaimer:
      "Laporan ini dihasilkan otomatis dari model estimasi Panen Radar berdasarkan data PIHPS, BPS, dan BMKG. Angka bisa berbeda dari kondisi lapangan aktual.",
  },
  en: {
    product: "Panen Radar",
    nav_peta: "Risk Map",
    nav_simulasi: "Planting Simulator",
    nav_darurat: "Emergency Harvest",
    sidebar_collapse: "Collapse sidebar",
    sidebar_expand: "Expand sidebar",
    loading: "Loading...",
    loading_map: "Loading map...",
    loading_sim: "Loading simulator...",
    load_error: "Failed to load data: {msg}",
    topbar_week: "{prov} — current week {n}",
    weather_badge: "BMKG as of {date} · {rain}/{total} hubs may see rain",
    kpi_top_risk: "Highest risk",
    kpi_index: "Index {n}",
    kpi_peak_price: "Lowest price at harvest peak",
    kpi_no_data: "Not yet available",
    kpi_peak_price_floor_note: "Province-wide estimate",
    kpi_peak_week: "Harvest peak week",
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
    peak_projection: "Highest projected price ({w})",
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
      "The absorbers below are real organizations found via public research (verified name & location) — but capacity and offer price are still illustrative estimates, not confirmed directly with the organization. Distance/score matching is precomputed in the backend, not recalculated here.",
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
    map_hint_sim: "Click a region for details — click a sentra (bold outline when selected) to simulate its planting schedule",
    kota_status: "Not analysed",
    kota_notice:
      "{nama} is a city — not a horticulture production area, so it is excluded from the risk map analysis. Its retail price data is instead used as a proxy signal for the surrounding regencies.",
    proxy_caption:
      "No producer price data here. The bold band/line is the estimated price farmers actually receive (not a measured figure). The thin dashed line is {sumber} retail price, the data source — not what farmers receive.",
    proxy_band_label: "Estimated producer price",
    retail_line_label: "{sumber} retail price (reference)",
    nav_peta_simulasi: "Map & Simulation",
    band_tanam: "Planting Window",
    band_panen: "Peak Harvest",
    popup_close: "✕ Close",
    popup_baseline: "Planting usually starts week W{w}",
    popup_no_shift: "Not shifted (planting W{w})",
    popup_slider_aria: "Shift planting schedule — {nama}",
    popup_hint: "Drag the slider to delay planting by a few weeks and see the effect in the simulation result panel.",
    popup_not_sentra: "This regency isn't one of the scraped sentra for planting simulation — there's no planting-schedule data to simulate here yet.",
    popup_zom_generik: "⚠ This regency has no real BMKG monsoon-onset data yet — the planting schedule above is modeled to approximate real conditions (generic seasonal assumption), and will be refined once full data is available.",
    hasil_simulasi_title: "Planting simulation result",
    hasil_simulasi_note:
      "The curve shows the province-wide effect of the shifted planting schedule against the unchanged baseline. This regency's own risk index on the map still follows its new harvest week — it doesn't disappear, it just moves. What improves here is how the harvest load is spread across the province, so the price doesn't fall as deeply as it would without staggering.",
    laporan_buat: "Generate Report",
    laporan_membuat: "Preparing...",
    laporan_preview_title: "Report Preview",
    laporan_kembali: "← Back",
    laporan_export: "Export PDF",
    laporan_exporting: "Generating PDF...",
    laporan_export_error: "Failed to generate the PDF. Please try again.",
    laporan_generated_at: "Generated {tanggal}",
    laporan_no_kabupaten_hint: "No regency selected — this is a province-level summary.",
    laporan_section_risiko: "Risk Summary & Trend",
    laporan_section_kualitas: "Data Quality Note",
    laporan_section_simulasi: "Planting Shift Simulation Result",
    laporan_skor_sekarang: "Risk score this week",
    laporan_top_ranking_title: "Top 5 Highest-Risk Regencies",
    laporan_coverage_title: "Data Coverage",
    laporan_geser_label: "Planting schedule shifted",
    laporan_harga_dasar: "Base price",
    laporan_footer_disclaimer:
      "This report is generated automatically from Panen Radar's estimation model using PIHPS, BPS, and BMKG data. Figures may differ from actual field conditions.",
  },
};

// Absorber jenis values live in the backend data in Indonesian; this maps
// them for display in English mode only (Indonesian mode shows them raw).
const JENIS_EN = {
  Pengolah: "Processor",
  "Bank Pangan": "Food bank",
  Koperasi: "Cooperative",
  "Pasar Modern": "Modern retail",
  "Pasar Induk": "Wholesale market",
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
