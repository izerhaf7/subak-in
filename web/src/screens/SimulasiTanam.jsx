import { useEffect, useState } from "react";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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

  const minHargaSebelum = Math.min(...chartData.map((d) => d.hargaSebelum));
  const minHargaSesudah = Math.min(...chartData.map((d) => d.hargaSesudah));

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
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("sim_peak_drop")}</span>
          <span className="kpi-chip__value">{penurunanPuncakPct}%</span>
        </div>
        <div className="kpi-chip">
          <span className="kpi-chip__label">{lang === "id" ? "Harga Terendah (Sebelum)" : "Min Price (Before)"}</span>
          <span className="kpi-chip__value">Rp{minHargaSebelum.toLocaleString("id-ID")}</span>
        </div>
        <div className="kpi-chip" style={{ borderRight: "none" }}>
          <span className="kpi-chip__label">{lang === "id" ? "Harga Terendah (Sesudah)" : "Min Price (After)"}</span>
          <span className="kpi-chip__value" style={{ color: minHargaSesudah > minHargaSebelum ? "var(--sawah)" : "inherit" }}>
            Rp{minHargaSesudah.toLocaleString("id-ID")}
          </span>
          {minHargaSesudah > minHargaSebelum && (
            <span className="kpi-chip__sub" style={{ color: "var(--sawah)", fontWeight: "bold" }}>
              ↑ +{Math.round(((minHargaSesudah - minHargaSebelum) / minHargaSebelum) * 100)}% {lang === "id" ? "lebih stabil" : "better"}
            </span>
          )}
        </div>
      </div>
      <div className="peta-risiko__body">
        <div className="peta-risiko__map-col">
          <div className="sim-guide-card">
            <h3>{lang === "id" ? "📊 Panduan Simulasi Tanam" : "📊 Planting Simulation Guide"}</h3>
            <p>
              {lang === "id" 
                ? "Gunakan slider di panel kanan untuk menunda jadwal masa tanam kabupaten (dalam minggu). Garis putus-putus abu-abu menunjukkan rencana awal (Sebelum), sedangkan garis hijau solid menunjukkan proyeksi hasil simulasi (Sesudah). Tujuannya adalah meratakan pasokan pasca-panen agar harga tidak jatuh drastis." 
                : "Use the sliders in the right panel to delay the regencies' planting schedules (in weeks). The dashed gray line shows the original plan (Before), while the solid green line shows the simulated projection (After). The goal is to smooth out supply peaks and prevent price crashes."}
            </p>
          </div>
          <div className="simulasi-tanam__chart-block">
            <span className="peta-risiko__map-head-title">
              {lang === "id" ? "Rencana Awal (Sebelum Pengoptimalan) — Hubungan Pasokan & Harga" : "Original Plan (Before Optimization) — Supply & Price Correlation"}
            </span>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
                <XAxis dataKey="minggu" tick={{ fontSize: 10 }} interval={2} />
                <YAxis yAxisId="left" orientation="left" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#be123c" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Area yAxisId="left" type="monotone" dataKey="pasokanSebelum" name={lang === "id" ? "Pasokan (Ton)" : "Supply (Tons)"} fill="#cbd5e1" stroke="#94a3b8" fillOpacity={0.4} />
                <Line yAxisId="right" type="monotone" dataKey="hargaSebelum" name={lang === "id" ? "Proyeksi Harga (Rp/kg)" : "Projected Price (Rp/kg)"} stroke="#be123c" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="simulasi-tanam__chart-block">
            <span className="peta-risiko__map-head-title">
              {lang === "id" ? "Hasil Simulasi (Sesudah Pengoptimalan) — Hubungan Pasokan & Harga" : "Simulated Plan (After Optimization) — Supply & Price Correlation"}
            </span>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
                <XAxis dataKey="minggu" tick={{ fontSize: 10 }} interval={2} />
                <YAxis yAxisId="left" orientation="left" stroke="#22c55e" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#007d0b" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Area yAxisId="left" type="monotone" dataKey="pasokanSesudah" name={lang === "id" ? "Pasokan (Ton)" : "Supply (Tons)"} fill="#bbf7d0" stroke="#22c55e" fillOpacity={0.4} />
                <Line yAxisId="right" type="monotone" dataKey="hargaSesudah" name={lang === "id" ? "Proyeksi Harga (Rp/kg)" : "Projected Price (Rp/kg)"} stroke="#007d0b" strokeWidth={2.5} dot={false} />
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
            {simulasi.kabupaten.map((k) => {
              const isShifted = (geser[k.id] ?? 0) > 0;
              return (
                <div 
                  key={k.id} 
                  className={isShifted ? "simulasi-tanam__slider-row simulasi-tanam__slider-row--active" : "simulasi-tanam__slider-row"}
                >
                  <div className="simulasi-tanam__slider-label">
                    <span style={{ fontWeight: isShifted ? "700" : "normal" }}>{k.nama}</span>
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
