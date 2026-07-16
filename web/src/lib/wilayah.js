// Kota bukan wilayah analisis produksi: di peta ditampilkan putih ("tidak
// dianalisis"), tidak ikut ranking/KPI. Data eceran kota dipakai backend
// sebagai sumber proxy untuk kabupaten pasangannya. Daftar ini cermin dari
// KOTA_IDS di model/run_all.py — kalau salah satu berubah, ubah keduanya.
export const KOTA_IDS = new Set([
  "bogor_kota", "sukabumi_kota", "bandung_kota", "cirebon_kota",
  "bekasi_kota", "depok", "cimahi", "tasikmalaya_kota", "banjar",
]);
