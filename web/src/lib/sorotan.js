import { KOTA_IDS } from "./wilayah.js";

// Penurunan harga terparah di antara kabupaten yang datanya TERUKUR.
//
// Status diambil dari map.json, bukan dari status_data di dalam file
// kabupaten: keduanya bisa berbeda (sumedang measured di file kabupatennya
// tapi modeled di map.json). map.json yang menang karena itu yang mewarnai
// peta — angka sorotan harus konsisten dengan apa yang dilihat user.
//
// measured_stale sengaja tidak ikut: serinya sudah berhenti dikumpulkan, dan
// memajang penurunan harga dari data setua itu sebagai kondisi hari ini
// menyesatkan — alasan yang sama dengan stale_note di layar detail.
export function sorotanHarga(mapData, kabupatenFiles) {
  if (!mapData?.kabupaten || !Array.isArray(kabupatenFiles)) return null;

  const measured = new Set(
    mapData.kabupaten.filter((k) => k.status_data === "measured").map((k) => k.id)
  );

  let best = null;
  for (const file of kabupatenFiles) {
    if (!file || !measured.has(file.id)) continue;

    const historis = file.harga?.historis ?? [];
    const rp = historis.map((h) => h.rp).filter((x) => typeof x === "number");
    if (rp.length === 0) continue;

    const puncakRp = Math.max(...rp);
    if (puncakRp <= 0) continue;

    const dasarRp = Math.min(...rp);
    const turunPersen = Math.round((1 - dasarRp / puncakRp) * 100);

    if (!best || turunPersen > best.turunPersen) {
      best = { id: file.id, nama: file.nama, puncakRp, dasarRp, turunPersen, nMinggu: historis.length };
    }
  }
  return best;
}

// Minggu dengan beban risiko provinsi tertinggi. Kota dikecualikan dengan
// alasan yang sama seperti di peta: bukan wilayah produksi, tidak dianalisis.
export function mingguPuncakRisiko(mapData) {
  const kabupaten = (mapData?.kabupaten ?? []).filter((k) => !KOTA_IDS.has(k.id));

  const total = new Map();
  for (const k of kabupaten) {
    for (const r of k.risk_mingguan ?? []) {
      total.set(r.minggu, (total.get(r.minggu) ?? 0) + r.skor);
    }
  }

  let best = null;
  for (const [minggu, skorTotal] of total) {
    if (!best || skorTotal > best.skorTotal) best = { minggu, skorTotal };
  }
  return best;
}
