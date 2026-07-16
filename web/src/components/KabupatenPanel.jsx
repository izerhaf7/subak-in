import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "./StatusBadge.jsx";
import { TOOLTIP_PROPS } from "../lib/chartStyle.js";
import { useT } from "../lib/i18n.jsx";

function buildChartData(kabupaten) {
  const historisEntries = kabupaten.harga.historis.slice(-26);
  const forecastEntries = kabupaten.harga.forecast;
  const retailMap = new Map((kabupaten.retail_overlay ?? []).map((r) => [r.minggu, r.rp]));

  const rows = historisEntries.map((h) => ({
    minggu: h.minggu,
    historis: h.rp,
    forecast: null,
    band: null,
    retail: retailMap.get(h.minggu) ?? null,
  }));

  for (const f of forecastEntries) {
    rows.push({
      minggu: f.minggu,
      historis: null,
      forecast: f.rp,
      band: [f.lo, f.hi],
      retail: retailMap.get(f.minggu) ?? null,
    });
  }

  return rows;
}

function formatRp(rp) {
  return `Rp${rp.toLocaleString("id-ID")}`;
}

export default function KabupatenPanel({ kabupaten }) {
  const { t } = useT();
  const data = buildChartData(kabupaten);
  const hasRetail = Boolean(kabupaten.retail_overlay);
  const lastMeasured = kabupaten.harga.historis.at(-1);
  const peakForecast = kabupaten.harga.forecast.reduce(
    (max, f) => (f.rp > (max?.rp ?? -Infinity) ? f : max),
    null
  );

  return (
    <aside className="kabupaten-panel">
      <header className="kabupaten-panel__header">
        <h2>{kabupaten.nama}</h2>
        <StatusBadge status={kabupaten.status_data} />
      </header>
      <dl className="kabupaten-panel__kpi">
        {lastMeasured && (
          <div>
            <dt>{t("last_measured", { w: lastMeasured.minggu })}</dt>
            <dd className="angka-terukur">{formatRp(lastMeasured.rp)}</dd>
          </div>
        )}
        {peakForecast && (
          <div>
            <dt>{t("peak_projection", { w: peakForecast.minggu })}</dt>
            <dd className="angka-estimasi">{formatRp(peakForecast.rp)}</dd>
          </div>
        )}
      </dl>
      {kabupaten.status_data === "measured_stale" && kabupaten.harga.forecast.length === 0 && (
        <p className="blind-spot-notice__text" style={{ marginBottom: "0.75rem" }}>
          {t("stale_note")}
        </p>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
          <XAxis dataKey="minggu" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rp${Math.round(v / 1000)}rb`} />
          <Tooltip {...TOOLTIP_PROPS} formatter={(value) => (Array.isArray(value) ? `Rp${value[0]}–${value[1]}` : `Rp${value}`)} />
          <Area dataKey="band" stroke="none" fill="#8a3f28" fillOpacity={0.15} />
          <Line dataKey="historis" stroke="#52514e" dot={false} strokeWidth={2} connectNulls />
          <Line dataKey="forecast" stroke="#8a3f28" dot={false} strokeWidth={2} strokeDasharray="4 3" connectNulls />
          {hasRetail && (
            <Line dataKey="retail" stroke="#ad644e" dot={false} strokeWidth={1} connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </aside>
  );
}
