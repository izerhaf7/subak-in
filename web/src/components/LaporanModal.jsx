import { useRef, useState } from "react";
import { LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TOOLTIP_PROPS } from "../lib/chartStyle.js";
import { exportLaporanToPdf } from "../lib/exportPdf.js";
import { useT } from "../lib/i18n.jsx";

function formatRp(rp) {
  return rp == null ? "—" : `Rp${rp.toLocaleString("id-ID")}`;
}

function formatTanggal(iso, lang) {
  return new Date(iso).toLocaleString(lang === "id" ? "id-ID" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function statusBadgeKey(statusData) {
  if (statusData === "measured") return "badge_measured";
  if (statusData === "measured_stale") return "badge_stale";
  return "badge_modeled";
}

export default function LaporanModal({ report, onClose }) {
  const { t, lang } = useT();
  const previewRef = useRef(null);
  const [status, setStatus] = useState("idle"); // "idle" | "exporting" | "error"

  async function handleExport() {
    setStatus("exporting");
    try {
      const fileNameHint = report.mode === "kabupaten"
        ? `laporan-panen-radar-${report.kabupaten.id}-${report.komoditas.id}-W${report.mingguKonteks.dilihat}`
        : `laporan-panen-radar-provinsi-${report.komoditas.id}-W${report.mingguKonteks.dilihat}`;
      await exportLaporanToPdf(previewRef.current, fileNameHint);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("laporan_preview_title")}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="modal-panel">
        <div className="modal-panel__header">
          <span>{t("laporan_preview_title")}</span>
          <button type="button" className="modal-panel__close" onClick={onClose} aria-label={t("laporan_kembali")}>
            ✕
          </button>
        </div>
        <div className="modal-panel__body">
          <div className="laporan-preview" ref={previewRef}>
            <header className="laporan-preview__header">
              <h1>
                {report.mode === "kabupaten" ? report.kabupaten.nama : report.provinsi} · {report.komoditas.nama}
              </h1>
              <p className="laporan-preview__meta">
                {t("laporan_generated_at", { tanggal: formatTanggal(report.generatedAt, lang) })}
                {" · "}
                {report.mingguKonteks.dilihat === report.mingguKonteks.berjalan
                  ? t("timeline_this_week")
                  : t("week_n", { n: report.mingguKonteks.dilihat })}
                {report.mingguKonteks.isoLabel && ` · ${report.mingguKonteks.isoLabel}`}
              </p>
            </header>

            {report.mode === "provinsi" && (
              <p className="laporan-preview__note">{t("laporan_no_kabupaten_hint")}</p>
            )}

            {report.mode === "kabupaten" && (
              <section className="laporan-preview__section">
                <h2>{t("laporan_section_risiko")}</h2>
                <div className="laporan-preview__kpis">
                  <div>
                    <span className="laporan-preview__kpi-label">{t("laporan_skor_sekarang")}</span>
                    <span className="laporan-preview__kpi-value">{t("kpi_index", { n: report.risiko.skorSekarang })}</span>
                  </div>
                  <div>
                    <span className="laporan-preview__kpi-label">{t("kpi_peak_week")}</span>
                    <span className="laporan-preview__kpi-value">
                      {report.risiko.mingguPuncak === report.mingguKonteks.berjalan ? t("now") : t("week_n", { n: report.risiko.mingguPuncak })}
                    </span>
                  </div>
                  <div>
                    <span className="laporan-preview__kpi-label">{t("kpi_peak_price")}</span>
                    <span className="laporan-preview__kpi-value">
                      {report.risiko.hargaProyeksiPuncakRp == null ? t("kpi_no_data") : formatRp(report.risiko.hargaProyeksiPuncakRp)}
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={report.risiko.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
                    <XAxis dataKey="minggu" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Line type="monotone" dataKey="skor" stroke="#8a3f28" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </section>
            )}

            {report.mode === "kabupaten" && (
              <section className="laporan-preview__section">
                <h2>{t("laporan_section_kualitas")}</h2>
                <p className="laporan-preview__note">
                  {t(statusBadgeKey(report.kualitasData.statusData))}
                  {report.kualitasData.catatan && ` — ${report.kualitasData.catatan}`}
                </p>
              </section>
            )}

            {report.mode === "kabupaten" && report.simulasi && (
              <section className="laporan-preview__section">
                <h2>{t("laporan_section_simulasi")}</h2>
                <p className="laporan-preview__note">
                  {t("laporan_geser_label")}: {t("plus_weeks", { n: report.simulasi.geserMinggu })}
                </p>
                <div className="laporan-preview__kpis">
                  <div>
                    <span className="laporan-preview__kpi-label">{t("sim_peak_drop")}</span>
                    <span className="laporan-preview__kpi-value">{report.simulasi.penurunanPuncakPct}%</span>
                  </div>
                  <div>
                    <span className="laporan-preview__kpi-label">{lang === "id" ? "Harga dasar" : "Base price"}</span>
                    <span className="laporan-preview__kpi-value">
                      {formatRp(report.simulasi.hargaDasarSebelum)} → {formatRp(report.simulasi.hargaDasarSesudah)}
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={report.simulasi.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
                    <XAxis dataKey="minggu" tick={{ fontSize: 9 }} interval={4} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Line type="monotone" dataKey="hargaSebelum" name={t("before")} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                    <Line type="monotone" dataKey="hargaSesudah" name={t("after")} stroke="#007d0b" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="laporan-preview__note">{t("hasil_simulasi_note")}</p>
              </section>
            )}

            {report.mode === "provinsi" && (
              <section className="laporan-preview__section">
                <h2>{t("laporan_top_ranking_title")}</h2>
                <ol className="laporan-preview__ranking">
                  {report.topRanking.map((row) => (
                    <li key={row.id}>{row.nama} — {t("kpi_index", { n: row.skor })}</li>
                  ))}
                </ol>
              </section>
            )}

            {report.mode === "provinsi" && (
              <section className="laporan-preview__section">
                <h2>{t("laporan_coverage_title")}</h2>
                <p className="laporan-preview__note">{report.coverage.catatan}</p>
              </section>
            )}

            <footer className="laporan-preview__footer">{t("laporan_footer_disclaimer")}</footer>
          </div>

          {status === "error" && <p className="laporan-error">{t("laporan_export_error")}</p>}
        </div>
        <div className="modal-panel__footer">
          <button type="button" className="side-col__back" onClick={onClose}>{t("laporan_kembali")}</button>
          <button type="button" className="btn-primary" onClick={handleExport} disabled={status === "exporting"}>
            {status === "exporting" ? t("laporan_exporting") : t("laporan_export")}
          </button>
        </div>
      </div>
    </div>
  );
}
