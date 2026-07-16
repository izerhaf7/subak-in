import { useT } from "../lib/i18n.jsx";

const BADGES = {
  measured: { labelKey: "badge_measured", className: "status-badge status-badge--measured" },
  measured_stale: { labelKey: "badge_stale", className: "status-badge status-badge--stale" },
  modeled: { labelKey: "badge_modeled", className: "status-badge status-badge--modeled" },
};

export default function StatusBadge({ status }) {
  const { t } = useT();
  const info = BADGES[status] ?? BADGES.modeled;
  return <span className={info.className}>{t(info.labelKey)}</span>;
}
