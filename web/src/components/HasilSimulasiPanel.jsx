import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { summarizeSimulationImpact } from "../lib/supplyMath.js";
import { TOOLTIP_PROPS } from "../lib/chartStyle.js";
import { useT } from "../lib/i18n.jsx";

const WEEKS_OUT = 16;

// Side-col panel (260px, narrow) showing the province-wide Before/After
// supply+price effect of the active `geser` shifts — the same computation
// SimulasiTanam.jsx used to show across two full-width charts, condensed into
// one overlaid chart since this panel lives in the narrow side column.
export default function HasilSimulasiPanel({ simulasi, geser, kernel }) {
  const { t, lang } = useT();
  const { chartData, penurunanPuncakPct, minHargaSebelum, minHargaSesudah } = summarizeSimulationImpact(
    simulasi.pasokan_provinsi_baseline.ton_per_minggu,
    simulasi.kabupaten,
    geser,
    simulasi.permintaan_provinsi_mingguan_ton,
    simulasi.elastisitas_display.lookup,
    WEEKS_OUT
  );
  const lebihStabil = minHargaSesudah > minHargaSebelum;

  return (
    <aside className="kabupaten-panel hasil-simulasi-panel">
      <header className="kabupaten-panel__header">
        <h2>{t("hasil_simulasi_title")}</h2>
      </header>
      <div className="hasil-simulasi-panel__kpis">
        <div className="hasil-simulasi-panel__kpi">
          <span className="hasil-simulasi-panel__kpi-label">{t("sim_peak_drop")}</span>
          <span className="hasil-simulasi-panel__kpi-value">{penurunanPuncakPct}%</span>
        </div>
        <div className="hasil-simulasi-panel__kpi">
          <span className="hasil-simulasi-panel__kpi-label">
            {lang === "id" ? "Harga dasar" : "Base price"}
          </span>
          <span className="hasil-simulasi-panel__kpi-value">
            Rp{minHargaSebelum.toLocaleString("id-ID")} → Rp{minHargaSesudah.toLocaleString("id-ID")}
          </span>
          {lebihStabil && (
            <span className="hasil-simulasi-panel__kpi-sub">
              ↑ +{Math.round(((minHargaSesudah - minHargaSebelum) / minHargaSebelum) * 100)}%{" "}
              {lang === "id" ? "lebih stabil" : "more stable"}
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
          <XAxis dataKey="minggu" tick={{ fontSize: 9 }} interval={4} />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
          <Tooltip {...TOOLTIP_PROPS} />
          <Line type="monotone" dataKey="hargaSebelum" name={t("before")} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          <Line type="monotone" dataKey="hargaSesudah" name={t("after")} stroke="#007d0b" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="hasil-simulasi-panel__note">{t("hasil_simulasi_note")}</p>
    </aside>
  );
}
