import { useT } from "../lib/i18n.jsx";

export default function KotaNotice({ nama }) {
  const { t } = useT();
  return (
    <aside className="kabupaten-panel blind-spot-notice">
      <header className="kabupaten-panel__header">
        <h2>{nama}</h2>
        <span className="status-badge status-badge--modeled">{t("kota_status")}</span>
      </header>
      <p className="blind-spot-notice__text">{t("kota_notice", { nama })}</p>
    </aside>
  );
}
