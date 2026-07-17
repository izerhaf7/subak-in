import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "./StatusBadge.jsx";
import { TOOLTIP_PROPS } from "../lib/chartStyle.js";
import { useT } from "../lib/i18n.jsx";

// Panel untuk kabupaten buta produsen yang punya sinyal eceran: garis harga
// eceran (data asli) + rentang estimasi harga produsen (eceran x rasio
// transmisi p25-p75). Rentang, bukan angka tunggal — kejujuran tentang
// ketidakpastian adalah bagian dari desain.
export default function ProxyPanel({ kabupaten, compact = false }) {
  const { t } = useT();
  const proxy = kabupaten.proxy_eceran;
  const bandByMinggu = new Map(proxy.band.map((b) => [b.minggu, [b.rp_lo, b.rp_hi]]));

  const data = kabupaten.retail_overlay.map((r) => ({
    minggu: r.minggu,
    eceran: r.rp,
    band: bandByMinggu.get(r.minggu) ?? null,
  }));

  return (
    <aside className="kabupaten-panel">
      {/* compact: see KabupatenPanel.jsx's identical note - PlantingPopup
          already shows the region name for sentra kabupaten. */}
      {compact ? (
        <div className="kabupaten-panel__status-only">
          <StatusBadge status="modeled" />
        </div>
      ) : (
        <header className="kabupaten-panel__header">
          <h2>{kabupaten.nama}</h2>
          <StatusBadge status="modeled" />
        </header>
      )}
      <p className="blind-spot-notice__text" style={{ marginBottom: "0.75rem" }}>
        {t("proxy_caption", { sumber: proxy.sumber_nama })}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
          <XAxis dataKey="minggu" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rp${Math.round(v / 1000)}rb`} />
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={(value, name) =>
              Array.isArray(value) ? [`Rp${value[0].toLocaleString("id-ID")}–${value[1].toLocaleString("id-ID")}`, name] : [`Rp${Number(value).toLocaleString("id-ID")}`, name]
            }
          />
          <Area dataKey="band" name={t("proxy_band_label")} stroke="none" fill="#8a3f28" fillOpacity={0.14} />
          <Line dataKey="eceran" name={t("retail_line_label", { sumber: proxy.sumber_nama })} stroke="#52514e" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </aside>
  );
}
