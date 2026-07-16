import StatusBadge from "./StatusBadge.jsx";
import { useT } from "../lib/i18n.jsx";

export default function BlindSpotNotice({ nama }) {
  const { t } = useT();
  return (
    <aside className="kabupaten-panel blind-spot-notice">
      <header className="kabupaten-panel__header">
        <h2>{nama}</h2>
        <StatusBadge status="modeled" />
      </header>
      <p className="blind-spot-notice__text">{t("blind_spot", { nama })}</p>
    </aside>
  );
}
