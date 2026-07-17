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
import { summarizeSimulationImpact } from "../lib/supplyMath.js";
import { loadGeo, loadMap, loadKabupaten, loadSimulasi } from "../lib/loadData.js";
import { KOTA_IDS } from "../lib/wilayah.js";
import { recomputeAllRiskMingguan } from "../lib/riskMath.js";
import { riskColor, riskTextColor } from "../lib/riskColor.js";
import { useT } from "../lib/i18n.jsx";

const MEASURED_STATUSES = new Set(["measured", "measured_stale"]);

function formatRp(rp) {
  return rp == null ? "—" : `Rp${rp.toLocaleString("id-ID")}`;
}

const SIM_WEEKS_OUT = 20; // matches model/run_all.py's FORECAST_HORIZON

// Fallback for the "proyeksi harga saat panen raya" KPI when the top-risk
// kabupaten has no PIHPS forecast of its own (harga_proyeksi_puncak_rp is
// null - most kabupaten with real production volume aren't PIHPS price
// points). Deliberately the SAME NUMBER as HasilSimulasiPanel's "Harga
// dasar" - the lowest interpolated province-wide price anywhere across the
// whole horizon - and LIVE to the same `geser` shifts: if the user is
// mid-simulation, this KPI reflects the shifted ("sesudah") curve too,
// instead of freezing at the unshifted baseline while the sidebar panel
// moves. Three earlier versions each used a different definition (flat
// lookup-table minimum, price at one specific peak-risk week, then a static
// unshifted minimum) and each one drifted out of sync with whatever the
// simulation panel showed once the user actually dragged a slider - found
// via user confusion comparing this card to the panel below it mid-shift.
function fallbackHargaRp(simulasi, geser) {
  if (!simulasi?.pasokan_provinsi_baseline?.ton_per_minggu || !simulasi?.elastisitas_display?.lookup) return null;
  const { minHargaSebelum, minHargaSesudah } = summarizeSimulationImpact(
    simulasi.pasokan_provinsi_baseline.ton_per_minggu,
    simulasi.kabupaten,
    geser,
    simulasi.permintaan_provinsi_mingguan_ton,
    simulasi.elastisitas_display.lookup,
    SIM_WEEKS_OUT
  );
  const hasShift = Object.values(geser).some((v) => v > 0);
  return hasShift ? minHargaSesudah : minHargaSebelum;
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

// Recomputes EVERY kabupaten's risk_mingguan (not just the shifted one) live
// when a planting schedule is shifted, so the map/ranking reflect the
// PROVINCE-WIDE effect of the shift, not just an isolated recompute of the
// shifted kabupaten's own curve.
//
// BUG FOUND #1 (via user pressure-testing the live recolor): an earlier
// version recomputed the shifted curve with convolveSingleCohort(kohort_tanam
// +shift, ...) - but that function does a ONE-SHOT convolution with no
// cyclical lookback (by design - it's what simulasi.json's test_vector
// exercises, a single explicit cohort with no repeating cycles). Real
// kabupaten curves come from harvest_convolution() on the Python side, which
// DOES simulate several lookback cycles before "now" so in-progress harvests
// from earlier plantings are captured - re-deriving from kohort_tanam alone
// silently dropped that context, so shifting by even 1 week could shove most
// of a cohort's harvest past week 16 and make the curve (and its mean, and
// therefore the overlap score) collapse toward zero for reasons that had
// nothing to do with staggering actually working. Fix: never re-convolve.
// Shift pasokan_baseline_ton_wide's OWN index (the wider curve backing
// score_overlap_provinsi's mean, not the narrower displayed one) exactly
// like supplyMath.js's summarizeSimulationImpact already does for the
// provincial chart.
//
// BUG FOUND #2 (via user question: "kalau semua kabupaten yang timing-nya
// sama di-stagger serentak dengan jumlah sama, index harusnya cuma pindah
// minggu, bukan turun ke hijau"): scoring the shifted kabupaten against its
// OWN mean curve (risk.py's original score_overlap) has no way to detect
// "every kabupaten with matching timing moved together, the pileup is
// unchanged, just later" - it only sees ITS OWN curve looking less
// concentrated relative to itself and drops the score, even though the
// province-wide pileup those kabupaten create together hasn't gone away.
// Fix: risk.py's score_overlap_provinsi (ported here as
// recomputeAllRiskMingguan) scores every kabupaten against the ACTUAL
// province-wide curve instead - a kabupaten shifting ALONE away from where
// others still peak correctly drops; kabupaten shifting together correctly
// stay elevated.
function shiftCurve(baselineTon, shift) {
  const n = baselineTon.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i - shift >= 0 && i - shift < n) out[i] = baselineTon[i - shift];
  }
  return out;
}

function withLiveRisk(mapData, simulasi, geser, mingguBerjalan) {
  if (!mapData || !simulasi) return mapData;
  const shiftedEntries = Object.entries(geser).filter(([, v]) => v > 0);
  if (shiftedEntries.length === 0) return mapData;

  const simById = Object.fromEntries(simulasi.kabupaten.map((k) => [k.id, k]));

  // Only kabupaten present in simulasi.json have a pasokan_baseline_ton_wide
  // curve to recompute against - kota and any kabupaten without luas data
  // stay at their backend-computed baseline score, since there's no
  // individual curve for them to re-score (their contribution to the
  // province sum is already correctly baked into map.json's provinsi_ton_wide).
  const shiftedCurves = {};
  for (const [id, shift] of shiftedEntries) {
    const simRow = simById[id];
    if (!simRow?.pasokan_baseline_ton_wide) continue;
    shiftedCurves[id] = {
      before: simRow.pasokan_baseline_ton_wide,
      after: shiftCurve(simRow.pasokan_baseline_ton_wide, shift),
    };
  }
  if (Object.keys(shiftedCurves).length === 0) return mapData;

  const curveById = {};
  const riskInputsById = {};
  for (const k of mapData.kabupaten) {
    const simRow = simById[k.id];
    if (!simRow?.pasokan_baseline_ton_wide || !k.risk_inputs) continue;
    const shifted = shiftedCurves[k.id];
    curveById[k.id] = shifted ? shifted.after : simRow.pasokan_baseline_ton_wide;
    riskInputsById[k.id] = k.risk_inputs;
  }

  const recomputed = recomputeAllRiskMingguan(
    mapData.provinsi_ton_wide, mapData.max_ton_wide, shiftedCurves, curveById, riskInputsById, mingguBerjalan
  );

  const kabupaten = mapData.kabupaten.map((k) => {
    const risk_mingguan = recomputed[k.id];
    if (!risk_mingguan) return k;
    const peakIdx = risk_mingguan.reduce((best, r, i) => (r.skor > risk_mingguan[best].skor ? i : best), 0);
    return {
      ...k,
      risk_mingguan,
      kpi: {
        ...k.kpi,
        risk_puncak: risk_mingguan[peakIdx].skor,
        minggu_puncak: risk_mingguan[peakIdx].minggu,
      },
    };
  });
  return { ...mapData, kabupaten };
}

export default function PetaSimulasi({ meta, komoditasId, onKomoditasChange }) {
  const { t, lang } = useT();
  const [geo, setGeo] = useState(null);
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
    // Komoditas switcher now lives in the app topbar (persists across nav),
    // not inside this screen - reset selection here in response to the prop
    // changing, instead of an in-component handler that used to also flip
    // local komoditasId state.
    setSelectedId(null);
    setKabupatenDetail(null);
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
    // NOT loaded for sentra kabupaten: an earlier version loaded this for
    // sentra too, to show a separate historical price chart alongside the
    // planting popup and HasilSimulasiPanel - found via user feedback this
    // produced 3 stacked cards fighting for space, with TWO different-looking
    // prices (raw historical/forecast trend vs. the simulation's provincial
    // "harga dasar") that read as contradictory even though they measure
    // different things. Fix: sentra now show exactly 2 cards - the planting
    // popup (PlantingPopup) and the simulation result (HasilSimulasiPanel,
    // now always visible once a sentra is selected, not just after a shift)
    // - one single price narrative instead of two.
  }, [selectedId, komoditasId, selectedIsSentra, selectedIsKota]);

  const hasActiveSimulation = Object.values(geser).some((v) => v > 0);

  const kernel = meta.komoditas.find((k) => k.id === komoditasId)?.kernel_panen;
  const liveMapData = useMemo(
    () => withLiveRisk(mapData, simulasi, geser, meta.minggu_berjalan),
    [mapData, simulasi, geser, meta.minggu_berjalan]
  );

  if (error) return <p className="app-error">{t("load_error", { msg: error })}</p>;
  if (!geo || !mapData || !simulasi) return <p className="app-loading">{t("loading_map")}</p>;

  const top = topRisikoKpi(liveMapData, minggu);
  const fallbackPrice = fallbackHargaRp(simulasi, geser);
  const measuredCount = mapData.kabupaten.filter((k) => MEASURED_STATUSES.has(k.status_data)).length;
  const coverageNote =
    lang === "id"
      ? meta.catatan_coverage?.[komoditasId] ?? t("coverage_fallback", { m: measuredCount })
      : t("coverage_fallback", { m: measuredCount });

  const bandKab = pickBandKabupaten(simulasi, liveMapData, selectedId);
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
        ? buildKabupatenReport({ mapData: liveMapData, kabupatenDetail: detailForReport, kabupatenId: selectedId, simulasi, geser, meta, komoditasId, minggu, t })
        : buildProvinsiReport({ mapData: liveMapData, meta, komoditasId, minggu, coverageNote });
      setLaporanData(report);
    } finally {
      setLaporanLoading(false);
    }
  }

  // Tanggal disabled-select ini SENGAJA di-hardcode ke 18 Jul (bukan
  // new Date()) untuk demo presentasi - laptop demo mungkin tidak diset ke
  // tanggal yang sama dengan data (weather.json juga di-anchor ke 18 Jul),
  // jadi hardcode menjaga kedua tanggal itu tetap konsisten satu sama lain
  // di panggung, terlepas dari jam sistem yang sebenarnya.
  const todayLabel = "18 Jul";

  return (
    <div className="peta-risiko">
      {/* Filter bar: location + date are DISABLED selects, not live filters -
          this app only ever analyzes Jawa Barat (hardcoded provincewide
          across the whole backend, no other province exists to switch to)
          and the "date" is already driven by the timeline slider below the
          map + meta.minggu_berjalan, not a separate control. Rendered
          disabled/visual-only to match the reference layout's filter-bar
          shape without implying a filter that doesn't actually do anything -
          an enabled-but-inert dropdown would be more misleading than a
          disabled one. */}
      <div className="filter-bar">
        <div className="filter-bar__selects">
          <select className="filter-bar__select" disabled value={meta.provinsi}>
            <option value={meta.provinsi}>{meta.provinsi}</option>
          </select>
          <select className="filter-bar__select" disabled value={todayLabel}>
            <option value={todayLabel}>{todayLabel}</option>
          </select>
        </div>
        <KomoditasSwitcher activeId={komoditasId} onChange={onKomoditasChange} />
        <div className="filter-bar__spacer" />
        <button type="button" className="btn-primary" onClick={handleBuatLaporan} disabled={laporanLoading}>
          {laporanLoading ? t("laporan_membuat") : t("laporan_buat")}
        </button>
      </div>
      <div className="kpi-section">
        <p className="kpi-section__note">{coverageNote}</p>
        <div className="kpi-row__cards">
          <div className="kpi-chip" style={{ "--kpi-accent": riskColor(top.skorMingguIni) }}>
            <span className="kpi-chip__label">{t("kpi_top_risk")}</span>
            <span className="kpi-chip__value" style={{ color: riskTextColor(top.skorMingguIni) }}>{top.nama}</span>
            <span className="kpi-chip__sub">{t("kpi_index", { n: top.skorMingguIni })}</span>
          </div>
          <div className="kpi-chip" style={{ "--kpi-accent": "var(--aksen)" }}>
            <span className="kpi-chip__label">{t("kpi_peak_price")}</span>
            {top.kpi.harga_proyeksi_puncak_rp != null ? (
              <span className="kpi-chip__value angka-estimasi">{formatRp(top.kpi.harga_proyeksi_puncak_rp)}</span>
            ) : fallbackPrice != null ? (
              <>
                <span className="kpi-chip__value angka-estimasi">{formatRp(fallbackPrice)}</span>
                <span className="kpi-chip__sub">{t("kpi_peak_price_floor_note")}</span>
              </>
            ) : (
              <span className="kpi-chip__value kpi-chip__value--empty">{t("kpi_no_data")}</span>
            )}
          </div>
          <div className="kpi-chip" style={{ "--kpi-accent": "var(--risk-high)" }}>
            <span className="kpi-chip__label">{t("kpi_peak_week")}</span>
            <span className="kpi-chip__value">
              {top.kpi.minggu_puncak === meta.minggu_berjalan ? t("now") : t("week_n", { n: top.kpi.minggu_puncak })}
            </span>
          </div>
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
            mapData={liveMapData}
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

          {(selectedIsSentra || hasActiveSimulation) && (
            <HasilSimulasiPanel
              simulasi={simulasi}
              geser={geser}
              kernel={kernel}
              onReset={() => setGeser(Object.fromEntries(simulasi.kabupaten.map((k) => [k.id, 0])))}
            />
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
