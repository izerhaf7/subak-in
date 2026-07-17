import { KOTA_IDS } from "./wilayah.js";

// Maximum drawdown suatu seri harga: puncak BERJALAN (running peak) diikuti
// oleh titik terendah SETELAHNYA yang paling dalam relatif terhadap puncak
// itu. Ini beda dari Math.max/Math.min biasa, yang buta urutan waktu — kalau
// dasarnya kebetulan muncul SEBELUM puncaknya di array, Math.max/Math.min
// tetap melaporkan "penurunan" padahal yang terjadi justru kenaikan harga.
// Mengembalikan null kalau tidak ada dasar yang benar-benar terjadi setelah
// suatu puncak (mis. seri naik terus, atau seri sepanjang 1 titik).
function maxDrawdown(rp) {
  let puncakRp = rp[0];
  let puncakIdx = 0;
  let best = null;

  for (let i = 1; i < rp.length; i++) {
    if (rp[i] > puncakRp) {
      puncakRp = rp[i];
      puncakIdx = i;
      continue;
    }
    if (puncakRp <= 0) continue; // hindari bagi nol; tidak ada dasar valid dari puncak <= 0

    const turunPersen = Math.round((1 - rp[i] / puncakRp) * 100);
    if (!best || turunPersen > best.turunPersen) {
      best = { puncakRp, dasarRp: rp[i], turunPersen, nMingguJatuh: i - puncakIdx };
    }
  }
  return best;
}

// Penurunan harga terparah (maximum drawdown) di antara kabupaten yang
// datanya TERUKUR.
//
// Status diambil dari map.json, bukan dari status_data di dalam file
// kabupaten: keduanya bisa berbeda (sumedang measured di file kabupatennya
// tapi modeled di map.json). map.json yang menang karena itu yang mewarnai
// peta — angka sorotan harus konsisten dengan apa yang dilihat user.
//
// measured_stale sengaja tidak ikut: serinya sudah berhenti dikumpulkan, dan
// memajang penurunan harga dari data setua itu sebagai kondisi hari ini
// menyesatkan — alasan yang sama dengan stale_note di layar detail.
//
// Kota dikecualikan dengan alasan yang sama seperti di peta dan di
// mingguPuncakRisiko: bukan wilayah produksi, dipetakan putih ("tidak
// dianalisis") — headline tidak boleh menyorot wilayah yang peta di
// sebelahnya bilang tidak dianalisis.
export function sorotanHarga(mapData, kabupatenFiles) {
  if (!mapData?.kabupaten || !Array.isArray(kabupatenFiles)) return null;

  const measured = new Set(
    mapData.kabupaten
      .filter((k) => k.status_data === "measured" && !KOTA_IDS.has(k.id))
      .map((k) => k.id)
  );

  let best = null;
  for (const file of kabupatenFiles) {
    if (!file || !measured.has(file.id)) continue;

    const historis = file.harga?.historis ?? [];
    const rp = historis.map((h) => h.rp).filter((x) => typeof x === "number");
    if (rp.length === 0) continue;

    const drawdown = maxDrawdown(rp);
    if (!drawdown) continue;

    if (!best || drawdown.turunPersen > best.turunPersen) {
      best = {
        id: file.id,
        nama: file.nama,
        puncakRp: drawdown.puncakRp,
        dasarRp: drawdown.dasarRp,
        turunPersen: drawdown.turunPersen,
        nMingguJatuh: drawdown.nMingguJatuh,
        nMinggu: historis.length,
      };
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
