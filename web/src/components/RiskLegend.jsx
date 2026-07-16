import { useT } from "../lib/i18n.jsx";

export default function RiskLegend() {
  const { t } = useT();
  return (
    <div className="risk-legend">
      <span>{t("legend")}</span>
      <div className="risk-legend__bar" />
      <span>0</span>
      <span>→</span>
      <span>100</span>
    </div>
  );
}
