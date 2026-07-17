import { useEffect, useMemo, useState } from "react";
import KomoditasSwitcher from "../components/KomoditasSwitcher.jsx";
import JabarMap from "../components/JabarMap.jsx";
import KabupatenPanel from "../components/KabupatenPanel.jsx";
import RiskLegend from "../components/RiskLegend.jsx";
import RankedList from "../components/RankedList.jsx";
import BlindSpotNotice from "../components/BlindSpotNotice.jsx";
import KotaNotice from "../components/KotaNotice.jsx";
import ProxyPanel from "../components/ProxyPanel.jsx";
import TimelineSlider from "../components/TimelineSlider.jsx";
import PlantingPopup from "../components/PlantingPopup.jsx";
import HasilSimulasiPanel from "../components/HasilSimulasiPanel.jsx";
import LaporanModal from "../components/LaporanModal.jsx";
import { buildKabupatenReport, buildProvinsiReport } from "../lib/reportBuilder.js";
import { loadGeo, loadMap, loadKabupaten, loadSimulasi } from "../lib/loadData.js";
import { KOTA_IDS } from "../lib/wilayah.js";
import { useT } from "../lib/i18n.jsx";

const MEASURED_STATUSES = new Set(["measured", "measured_stale"]);

function formatRp(rp) {
  return rp == null ? "—" : `Rp${rp.toLocaleString("id-ID")}`;
}

function topRisikoKpi(mapData, minggu) {
  const withScore = mapData.kabupaten.map((k) => {
    const entry = k.risk_mingguan.find((r) => r.minggu === minggu);
    return { ...k, skorMingguIni: entry ? entry.skor : 0 };
  });
  return withScore.reduce((a, b) => (b.skorMingguIni > a.skorMingguIni ? b : a));
}

// Picks which sentra's jendela_tanam/jendela_panen to show as timeline bands:
// the currently-selected sentra if one is picked, otherwise the sentra with
// the highest PEAK risk across the whole visible horizon (kpi.risk_puncak) -
// deliberately NOT recomputed per scrubbed week. An earlier version picked
// "highest risk THIS week", which flips between two closely-matched sentra
// on a single-week nudge (e.g. Bandung vs Garut swapping lead at W33/W34) -
// the whole band identity/size/position would teleport with no transition,
// reading as a glitch. Peak-risk is fixed per komoditas, so the reference
// sentra only changes when the user actually clicks a different one.
function pickBandKabupaten(simulasi, mapData, selectedId) {
  if (!simulasi) return null;
  if (selectedId) {
    const sel = simulasi.kabupaten.find((k) => k.id === selectedId);
    if (sel) return sel;
  }
  if (!mapData) return null;
  const sentraIds = new Set(simulasi.kabupaten.map((k) => k.id));
  let best = null;
  for (const k of mapData.kabupaten) {
    if (!sentraIds.has(k.id)) continue;
    const puncak = k.kpi?.risk_puncak ?? 0;
    if (!best || puncak > best.puncak) best = { id: k.id, puncak };
  }
  return best ? simulasi.kabupaten.find((k) => k.id === best.id) ?? null : null;
}

export default function PetaSimulasi({ meta }) {
  const { t, lang } = useT();
  const [geo, setGeo] = useState(null);
  const [komoditasId, setKomoditasId] = useState("cabai_rawit");
  const [mapData, setMapData] = useState(null);
  const [simulasi, setSimulasi] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [kabupatenDetail, setKabupatenDetail] = useState(null);
  const [minggu, setMinggu] = useState(meta.minggu_berjalan);
  const [geser, setGeser] = useState({});
  const [error, setError] = useState(null);
  const [laporanData, setLaporanData] = useState(null);
  const [laporanLoading, setLaporanLoading] = useState(false);

  useEffect(() => {
    loadGeo().then(setGeo).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setMapData(null);
    loadMap(komoditasId).then(setMapData).catch((e) => setError(e.message));
  }, [komoditasId]);

  useEffect(() => {
    setSimulasi(null);
    setGeser({});
    loadSimulasi(komoditasId)
      .then((d) => {
        setSimulasi(d);
        setGeser(Object.fromEntries(d.kabupaten.map((k) => [k.id, 0])));
      })
      .catch((e) => setError(e.message));
  }, [komoditasId]);

  const sentraIds = useMemo(() => new Set((simulasi?.kabupaten ?? []).map((k) => k.id)), [simulasi]);
  const selectedIsSentra = selectedId ? sentraIds.has(selectedId) : false;
  const selectedSentra = selectedIsSentra ? simulasi.kabupaten.find((k) => k.id === selectedId) : null;

  const selectedStatusData = selectedId
    ? mapData?.kabupaten.find((k) => k.id === selectedId)?.status_data
    : null;
  const selectedIsMeasured = selectedStatusData ? MEASURED_STATUSES.has(selectedStatusData) : false;
  const selectedIsKota = selectedId ? KOTA_IDS.has(selectedId) : false;

  useEffect(() => {
    if (!selectedId || selectedIsSentra || selectedIsKota) return;
    setKabupatenDetail(null);
    // Loads for BOTH measured (real forecast) and modeled (possible
    // proxy_eceran) kabupaten - the backend writes a detail file whenever
    // there's price OR supply data. A purely-modeled kabupaten with neither
    // (no proxy signal, no BPS supply) has no file at all; that 404 is an
    // expected "nothing to show" state here, not an app-level failure, so it
    // resolves to null rather than surfacing the blocking error banner.
    loadKabupaten(selectedId, komoditasId).then(setKabupatenDetail).catch(() => setKabupatenDetail(null));
  }, [selectedId, komoditasId, selectedIsSentra, selectedIsKota]);

  function handleKomoditasChange(id) {
    setKomoditasId(id);
    setSelectedId(null);
    setKabupatenDetail(null);
  }

  const hasActiveSimulation = Object.values(geser).some((v) => v > 0);

  if (error) return <p className="app-error">{t("load_error", { msg: error })}</p>;
  if (!geo || !mapData || !simulasi) return <p className="app-loading">{t("loading_map")}</p>;

  const top = topRisikoKpi(mapData, minggu);
  const measuredCount = mapData.kabupaten.filter((k) => MEASURED_STATUSES.has(k.status_data)).length;
  const coverageNote =
    lang === "id"
      ? meta.catatan_coverage?.[komoditasId] ?? t("coverage_fallback", { m: measuredCount })
      : t("coverage_fallback", { m: measuredCount });

  const kernel = meta.komoditas.find((k) => k.id === komoditasId).kernel_panen;
  const bandKab = pickBandKabupaten(simulasi, mapData, selectedId);
  const bands = bandKab
    ? [
        { label: `${t("band_tanam")} · ${bandKab.nama}`, mulai: bandKab.jendela_tanam.mulai_iso, akhir: bandKab.jendela_tanam.akhir_iso, jenis: "tanam" },
        { label: `${t("band_panen")} · ${bandKab.nama}`, mulai: bandKab.jendela_panen.mulai_iso, akhir: bandKab.jendela_panen.akhir_iso, jenis: "panen" },
      ]
    : [];

  async function handleBuatLaporan() {
    setLaporanLoading(true);
    try {
      let detailForReport = kabupatenDetail;
      if (selectedId && !selectedIsKota && !detailForReport) {
        try {
          detailForReport = await loadKabupaten(selectedId, komoditasId);
        } catch {
          detailForReport = null;
        }
      }
      const report = selectedId && !selectedIsKota
        ? buildKabupatenReport({ mapData, kabupatenDetail: detailForReport, kabupatenId: selectedId, simulasi, geser, meta, komoditasId, minggu, t })
        : buildProvinsiReport({ mapData, meta, komoditasId, minggu, coverageNote });
      setLaporanData(report);
    } finally {
      setLaporanLoading(false);
    }
  }

  return (
    <div className="peta-risiko">
      <div className="coverage-note">{coverageNote}</div>
      <div className="kpi-row">
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("kpi_top_risk")}</span>
          <span className="kpi-chip__value">{top.nama}</span>
          <span className="kpi-chip__sub">{t("kpi_index", { n: top.skorMingguIni })}</span>
        </div>
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("kpi_peak_price")}</span>
          <span className={top.kpi.harga_proyeksi_puncak_rp == null ? "kpi-chip__value kpi-chip__value--empty" : "kpi-chip__value angka-estimasi"}>
            {top.kpi.harga_proyeksi_puncak_rp == null ? t("kpi_no_data") : formatRp(top.kpi.harga_proyeksi_puncak_rp)}
          </span>
        </div>
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("kpi_peak_week")}</span>
          <span className="kpi-chip__value">
            {top.kpi.minggu_puncak === meta.minggu_berjalan ? t("now") : t("week_n", { n: top.kpi.minggu_puncak })}
          </span>
        </div>
        <div className="kpi-chip">
          <KomoditasSwitcher activeId={komoditasId} onChange={handleKomoditasChange} />
        </div>
        <div className="kpi-chip" style={{ borderRight: "none" }}>
          <button type="button" className="btn-primary" onClick={handleBuatLaporan} disabled={laporanLoading}>
            {laporanLoading ? t("laporan_membuat") : t("laporan_buat")}
          </button>
        </div>
      </div>
      <div className="peta-risiko__body">
        <div className="peta-risiko__map-col">
          <div className="peta-risiko__map-head">
            <span className="peta-risiko__map-head-title">{t("map_title")}</span>
            <RiskLegend />
          </div>
          <p className="map-hint">{t("map_hint_sim")}</p>
          <JabarMap
            geo={geo}
            mapData={mapData}
            minggu={minggu}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <TimelineSlider
            minggu={minggu}
            mingguBerjalan={meta.minggu_berjalan}
            labelMinggu={meta.label_minggu}
            onChange={setMinggu}
            bands={bands}
          />
        </div>
        <div className="side-col">
          <div className="side-col__title">
            <span>{selectedId ? t("detail_title") : t("ranking_title")}</span>
            {selectedId && (
              <button
                type="button"
                className="side-col__back"
                onClick={() => {
                  setSelectedId(null);
                  setKabupatenDetail(null);
                }}
              >
                {t("back_ranking")}
              </button>
            )}
          </div>

          {selectedIsSentra && (
            <PlantingPopup
              kabupaten={selectedSentra}
              geser={geser[selectedId] ?? 0}
              onChange={(v) => setGeser((prev) => ({ ...prev, [selectedId]: v }))}
              onClose={() => setSelectedId(null)}
            />
          )}

          {!selectedIsSentra && selectedId && (
            selectedIsKota ? (
              <KotaNotice nama={mapData.kabupaten.find((k) => k.id === selectedId)?.nama ?? selectedId} />
            ) : selectedIsMeasured ? (
              kabupatenDetail && <KabupatenPanel kabupaten={kabupatenDetail} />
            ) : kabupatenDetail?.proxy_eceran ? (
              <ProxyPanel kabupaten={kabupatenDetail} />
            ) : (
              <BlindSpotNotice nama={mapData.kabupaten.find((k) => k.id === selectedId)?.nama ?? selectedId} />
            )
          )}

          {hasActiveSimulation && (
            <HasilSimulasiPanel simulasi={simulasi} geser={geser} kernel={kernel} />
          )}

          {!selectedId && !hasActiveSimulation && (
            <RankedList mapData={mapData} minggu={minggu} onSelect={setSelectedId} />
          )}
        </div>
      </div>
      {laporanData && <LaporanModal report={laporanData} onClose={() => setLaporanData(null)} />}
    </div>
  );
}
