import { useEffect, useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { loadSimulasi } from "../lib/loadData.js";
import { aggregateSupplyCurve, interpolateHarga } from "../lib/supplyMath.js";
import { TOOLTIP_PROPS } from "../lib/chartStyle.js";
import { useT } from "../lib/i18n.jsx";

const WEEKS_OUT = 24;

export default function SimulasiTanam({ meta }) {
  const { t, lang } = useT();
  const [simulasi, setSimulasi] = useState(null);
  const [error, setError] = useState(null);
  const [geser, setGeser] = useState({});

  useEffect(() => {
    loadSimulasi()
      .then((d) => {
        setSimulasi(d);
        setGeser(Object.fromEntries(d.kabupaten.map((k) => [k.id, 0])));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="app-error">{t("load_error", { msg: error })}</p>;
  if (!simulasi) return <p className="app-loading">{t("loading_sim")}</p>;

  const kernel = meta.komoditas.find((k) => k.id === "cabai_rawit").kernel_panen;
  const zeroShift = Object.fromEntries(simulasi.kabupaten.map((k) => [k.id, 0]));

  const sebelum = aggregateSupplyCurve(simulasi.kabupaten, kernel.bobot_mingguan, kernel.mulai_panen_hari, zeroShift, WEEKS_OUT);
  const sesudah = aggregateSupplyCurve(simulasi.kabupaten, kernel.bobot_mingguan, kernel.mulai_panen_hari, geser, WEEKS_OUT);

  const chartData = sebelum.map((ton, i) => {
    const tonSesudah = sesudah[i];
    const rasioSebelum = ton / simulasi.permintaan_mingguan_ton;
    const rasioSesudah = tonSesudah / simulasi.permintaan_mingguan_ton;
    return {
      minggu: `M${i}`,
      pasokanSebelum: Math.round(ton * 10) / 10,
      pasokanSesudah: Math.round(tonSesudah * 10) / 10,
      hargaSebelum: Math.round(interpolateHarga(rasioSebelum, simulasi.elastisitas_display.lookup)),
      hargaSesudah: Math.round(interpolateHarga(rasioSesudah, simulasi.elastisitas_display.lookup)),
    };
  });

  const puncakSebelum = Math.max(...sebelum);
  const puncakSesudah = Math.max(...sesudah);
  const penurunanPuncakPct = puncakSebelum > 0 ? Math.round((1 - puncakSesudah / puncakSebelum) * 100) : 0;

  const areaNote = lang === "id" ? simulasi.catatan_alokasi_luas : t("sim_area_note");

  return (
    <div className="peta-risiko">
      <div className="kpi-row">
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("sim_peak_before")}</span>
          <span className="kpi-chip__value">{puncakSebelum.toFixed(0)} ton</span>
        </div>
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("sim_peak_after")}</span>
          <span className="kpi-chip__value">{puncakSesudah.toFixed(0)} ton</span>
        </div>
        <div className="kpi-chip" style={{ borderRight: "none" }}>
          <span className="kpi-chip__label">{t("sim_peak_drop")}</span>
          <span className="kpi-chip__value">{penurunanPuncakPct}%</span>
        </div>
      </div>
      <div className="peta-risiko__body">
        <div className="peta-risiko__map-col">
          <div className="simulasi-tanam__chart-block">
            <span className="peta-risiko__map-head-title">{t("sim_supply_chart")}</span>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
                <XAxis dataKey="minggu" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Line dataKey="pasokanSebelum" name={t("before")} stroke="#ad644e" strokeDasharray="4 3" dot={false} strokeWidth={2} />
                <Line dataKey="pasokanSesudah" name={t("after")} stroke="#8a3f28" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="simulasi-tanam__chart-block">
            <span className="peta-risiko__map-head-title">{t("sim_price_chart")}</span>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
                <XAxis dataKey="minggu" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Line dataKey="hargaSebelum" name={t("before")} stroke="#ad644e" strokeDasharray="4 3" dot={false} strokeWidth={2} />
                <Line dataKey="hargaSesudah" name={t("after")} stroke="#8a3f28" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="blind-spot-notice__text">{areaNote}</p>
        </div>
        <div className="side-col">
          <div className="side-col__title">
            <span>{t("sim_sliders_title")}</span>
            <button type="button" className="side-col__back" onClick={() => setGeser(zeroShift)}>
              {t("reset_all")}
            </button>
          </div>
          <div className="simulasi-tanam__sliders">
            {simulasi.kabupaten.map((k) => (
              <div key={k.id} className="simulasi-tanam__slider-row">
                <div className="simulasi-tanam__slider-label">
                  <span>{k.nama}</span>
                  <span className="simulasi-tanam__slider-value">{t("plus_weeks", { n: geser[k.id] ?? 0 })}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={k.geser_maks_minggu}
                  value={geser[k.id] ?? 0}
                  aria-label={`${t("sim_sliders_title")} — ${k.nama}`}
                  onChange={(e) => setGeser((prev) => ({ ...prev, [k.id]: Number(e.target.value) }))}
                />
                <span className="simulasi-tanam__slider-status">
                  {t(`status_${k.status_musim_hujan}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
