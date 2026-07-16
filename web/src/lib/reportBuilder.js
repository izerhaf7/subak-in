import { KOTA_IDS } from "./wilayah.js";
import { summarizeSimulationImpact } from "./supplyMath.js";

const MEASURED_STATUSES = new Set(["measured", "measured_stale"]);
const TOP_RANKING_COUNT = 5;
const SIMULASI_WEEKS_OUT = 24; // matches HasilSimulasiPanel.jsx's WEEKS_OUT

function buildMingguKonteks(meta, minggu) {
  return {
    berjalan: meta.minggu_berjalan,
    dilihat: minggu,
    isoLabel: meta.label_minggu[minggu - meta.minggu_berjalan] ?? null,
  };
}

export function buildProvinsiReport({ mapData, meta, komoditasId, minggu, coverageNote }) {
  const komoditas = meta.komoditas.find((k) => k.id === komoditasId);
  const measuredCount = mapData.kabupaten.filter((k) => MEASURED_STATUSES.has(k.status_data)).length;

  const topRanking = mapData.kabupaten
    .filter((k) => !KOTA_IDS.has(k.id))
    .map((k) => {
      const entry = k.risk_mingguan.find((r) => r.minggu === minggu);
      return { id: k.id, nama: k.nama, skor: entry ? entry.skor : 0 };
    })
    .sort((a, b) => b.skor - a.skor)
    .slice(0, TOP_RANKING_COUNT);

  return {
    mode: "provinsi",
    generatedAt: new Date().toISOString(),
    provinsi: meta.provinsi,
    komoditas: { id: komoditas.id, nama: komoditas.nama },
    mingguKonteks: buildMingguKonteks(meta, minggu),
    topRanking,
    coverage: {
      measuredCount,
      total: mapData.kabupaten.length,
      catatan: coverageNote,
    },
  };
}
