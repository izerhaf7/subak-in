import { KOTA_IDS } from "./wilayah.js";
import { summarizeSimulationImpact } from "./supplyMath.js";

const MEASURED_STATUSES = new Set(["measured", "measured_stale"]);
const TOP_RANKING_COUNT = 5;
const SIMULASI_WEEKS_OUT = 20; // matches HasilSimulasiPanel.jsx's WEEKS_OUT / model's FORECAST_HORIZON

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

function resolveKualitasCatatan(kabupatenDetail, statusData, nama, t) {
  if (!kabupatenDetail) return null;
  if (statusData === "modeled" && kabupatenDetail.proxy_eceran) {
    return t("proxy_caption", { sumber: kabupatenDetail.proxy_eceran.sumber_nama });
  }
  if (statusData === "modeled") {
    return t("blind_spot", { nama });
  }
  if (statusData === "measured_stale" && kabupatenDetail.harga.forecast.length === 0) {
    return t("stale_note");
  }
  return null;
}

export function buildKabupatenReport({ mapData, kabupatenDetail, kabupatenId, simulasi, geser, meta, komoditasId, minggu, t }) {
  const komoditas = meta.komoditas.find((k) => k.id === komoditasId);
  const kabMap = mapData.kabupaten.find((k) => k.id === kabupatenId);
  const entry = kabMap.risk_mingguan.find((r) => r.minggu === minggu);

  const simulasiKabupaten = simulasi.kabupaten.find((k) => k.id === kabupatenId) ?? null;
  const geserMinggu = geser[kabupatenId] ?? 0;
  let simulasiSection = null;
  if (simulasiKabupaten && geserMinggu > 0) {
    const { chartData, penurunanPuncakPct, minHargaSebelum, minHargaSesudah } = summarizeSimulationImpact(
      simulasi.pasokan_provinsi_baseline.ton_per_minggu,
      simulasi.kabupaten,
      geser,
      simulasi.permintaan_provinsi_mingguan_ton,
      simulasi.elastisitas_display.lookup,
      SIMULASI_WEEKS_OUT
    );
    simulasiSection = { geserMinggu, penurunanPuncakPct, hargaDasarSebelum: minHargaSebelum, hargaDasarSesudah: minHargaSesudah, chartData };
  }

  return {
    mode: "kabupaten",
    generatedAt: new Date().toISOString(),
    provinsi: meta.provinsi,
    komoditas: { id: komoditas.id, nama: komoditas.nama },
    kabupaten: { id: kabMap.id, nama: kabMap.nama, statusData: kabMap.status_data },
    mingguKonteks: buildMingguKonteks(meta, minggu),
    risiko: {
      skorSekarang: entry ? entry.skor : 0,
      mingguPuncak: kabMap.kpi.minggu_puncak,
      hargaProyeksiPuncakRp: kabMap.kpi.harga_proyeksi_puncak_rp,
      trend: kabMap.risk_mingguan,
    },
    kualitasData: {
      statusData: kabMap.status_data,
      catatan: resolveKualitasCatatan(kabupatenDetail, kabMap.status_data, kabMap.nama, t),
    },
    simulasi: simulasiSection,
  };
}
