import { useT } from "../lib/i18n.jsx";

export default function TimelineSlider({ minggu, mingguBerjalan, labelMinggu, onChange }) {
  const { t } = useT();
  const max = mingguBerjalan + labelMinggu.length - 1;
  const isoLabel = labelMinggu[minggu - mingguBerjalan] ?? "";

  return (
    <div className="timeline">
      <div className="timeline__caption">
        <span>{t("timeline_title")}</span>
        <span className="timeline__label">
          {minggu === mingguBerjalan ? t("timeline_this_week") : t("week_n", { n: minggu })}
          {isoLabel && <span className="timeline__iso"> · {isoLabel}</span>}
        </span>
      </div>
      <input
        type="range"
        min={mingguBerjalan}
        max={max}
        value={minggu}
        aria-label={t("timeline_pick")}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="timeline__ends">
        <span>{t("now")}</span>
        <span>{t("timeline_end", { n: labelMinggu.length - 1 })}</span>
      </div>
    </div>
  );
}
