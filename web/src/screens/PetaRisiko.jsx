import { useEffect, useState } from "react";
import KomoditasSwitcher from "../components/KomoditasSwitcher.jsx";
import JabarMap from "../components/JabarMap.jsx";
import KabupatenPanel from "../components/KabupatenPanel.jsx";
import RiskLegend from "../components/RiskLegend.jsx";
import RankedList from "../components/RankedList.jsx";
import BlindSpotNotice from "../components/BlindSpotNotice.jsx";
import KotaNotice from "../components/KotaNotice.jsx";
import ProxyPanel from "../components/ProxyPanel.jsx";
import TimelineSlider from "../components/TimelineSlider.jsx";
import { loadGeo, loadMap, loadKabupaten } from "../lib/loadData.js";
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
  const top = withScore.reduce((a, b) => (b.skorMingguIni > a.skorMingguIni ? b : a));
  return top;
}

export default function PetaRisiko({ meta }) {
  const { t, lang } = useT();
  const [geo, setGeo] = useState(null);
  const [komoditasId, setKomoditasId] = useState("cabai_rawit");
  const [mapData, setMapData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [kabupatenDetail, setKabupatenDetail] = useState(null);
  const [minggu, setMinggu] = useState(meta.minggu_berjalan);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGeo().then(setGeo).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setMapData(null);
    loadMap(komoditasId).then(setMapData).catch((e) => setError(e.message));
  }, [komoditasId]);

  const selectedStatusData = selectedId
    ? mapData?.kabupaten.find((k) => k.id === selectedId)?.status_data
    : null;
  const selectedIsMeasured = selectedStatusData ? MEASURED_STATUSES.has(selectedStatusData) : false;

  useEffect(() => {
    if (!selectedId || !selectedIsMeasured) return;
    setKabupatenDetail(null);
    loadKabupaten(selectedId, komoditasId).then(setKabupatenDetail).catch((e) => setError(e.message));
  }, [selectedId, komoditasId, selectedIsMeasured]);

  function handleKomoditasChange(id) {
    setKomoditasId(id);
    setSelectedId(null);
    setKabupatenDetail(null);
  }

  if (error) return <p className="app-error">{t("load_error", { msg: error })}</p>;
  if (!geo || !mapData) return <p className="app-loading">{t("loading_map")}</p>;

  const top = topRisikoKpi(mapData, minggu);
  const measuredCount = mapData.kabupaten.filter((k) => MEASURED_STATUSES.has(k.status_data)).length;
  const coverageNote =
    lang === "id"
      ? meta.catatan_coverage?.[komoditasId] ?? t("coverage_fallback", { m: measuredCount })
      : t("coverage_fallback", { m: measuredCount });

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
        <div className="kpi-chip" style={{ borderRight: "none" }}>
          <KomoditasSwitcher activeId={komoditasId} onChange={handleKomoditasChange} />
        </div>
      </div>
      <div className="peta-risiko__body">
        <div className="peta-risiko__map-col">
          <div className="peta-risiko__map-head">
            <span className="peta-risiko__map-head-title">{t("map_title")}</span>
            <RiskLegend />
          </div>
          <p className="map-hint">{t("map_hint")}</p>
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
          {selectedId ? (
            selectedIsMeasured ? (
              kabupatenDetail && <KabupatenPanel kabupaten={kabupatenDetail} />
            ) : (
              <BlindSpotNotice nama={mapData.kabupaten.find((k) => k.id === selectedId)?.nama ?? selectedId} />
            )
          ) : (
            <RankedList mapData={mapData} minggu={minggu} onSelect={setSelectedId} />
          )}
        </div>
      </div>
    </div>
  );
}
