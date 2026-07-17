import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "./StatusBadge.jsx";
import { TOOLTIP_PROPS } from "../lib/chartStyle.js";
import { useT } from "../lib/i18n.jsx";

// Panel untuk kabupaten buta produsen yang punya sinyal eceran: rentang
// estimasi harga PRODUSEN (eceran x rasio transmisi p25-p75) sebagai fokus
// utama - ini yang relevan buat petani, bukan harga eceran yang mereka tidak
// pernah terima langsung. Garis eceran (satu-satunya data ASLI/measured di
// sini - pita produsen adalah turunannya) tetap digambar untuk transparansi
// asal-usul data, tapi didemote jadi garis tipis putus-putus di belakang,
// bukan elemen utama seperti sebelumnya.
//
// BUG FOUND (via user: chart nampilin Rp50-80rb padahal panel simulasi bilang
// Rp14-15rb - dua angka itu BEDA PASAR (eceran konsumen vs produsen) DAN
// beda skop (satu kabupaten spesifik vs agregat provinsi), bukan salah
// hitung, tapi tampilannya menyesatkan karena eceran digambar sebagai garis
// utama tegas sementara justru produsen (yang relevan ke petani) cuma jadi
// pita transparan di background.
export default function ProxyPanel({ kabupaten, compact = false }) {
  const { t } = useT();
  const proxy = kabupaten.proxy_eceran;
  const bandByMinggu = new Map(proxy.band.map((b) => [b.minggu, [b.rp_lo, b.rp_hi]]));

  const data = kabupaten.retail_overlay.map((r) => {
    const band = bandByMinggu.get(r.minggu) ?? null;
    return {
      minggu: r.minggu,
      eceran: r.rp,
      band,
      produsenTengah: band ? (band[0] + band[1]) / 2 : null,
    };
  });

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
          <Area dataKey="band" name={t("proxy_band_label")} stroke="none" fill="#8a3f28" fillOpacity={0.18} />
          <Line dataKey="produsenTengah" name={t("proxy_band_label")} stroke="#8a3f28" dot={false} strokeWidth={2.5} />
          <Line dataKey="eceran" name={t("retail_line_label", { sumber: proxy.sumber_nama })} stroke="#a9a6a0" dot={false} strokeWidth={1} strokeDasharray="3 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </aside>
  );
}
