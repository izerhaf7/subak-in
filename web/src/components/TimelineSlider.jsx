import { useT } from "../lib/i18n.jsx";

// Splits a possibly year-wrapping ISO window (mulai > akhir means it crosses
// week 52 -> week 1) into non-wrapping [start, end] segments, then clips each
// to the visible [mingguBerjalan, max] timeline range. Returns [] if nothing
// in the window overlaps the visible weeks.
function visibleBandSegments(mulai, akhir, mingguBerjalan, max) {
  const rawSegments = mulai <= akhir ? [[mulai, akhir]] : [[mulai, 52], [1, akhir]];
  const clipped = [];
  for (const [start, end] of rawSegments) {
    const clippedStart = Math.max(start, mingguBerjalan);
    const clippedEnd = Math.min(end, max);
    if (clippedStart <= clippedEnd) clipped.push([clippedStart, clippedEnd]);
  }
  return clipped;
}

export default function TimelineSlider({ minggu, mingguBerjalan, labelMinggu, onChange, bands = [] }) {
  const { t } = useT();
  const max = mingguBerjalan + labelMinggu.length - 1;
  const isoLabel = labelMinggu[minggu - mingguBerjalan] ?? "";
  const span = max - mingguBerjalan;

  return (
    <div className="timeline">
      <div className="timeline__caption">
        <span>{t("timeline_title")}</span>
        <span className="timeline__label">
          {minggu === mingguBerjalan ? t("timeline_this_week") : t("week_n", { n: minggu })}
          {isoLabel && <span className="timeline__iso"> · {isoLabel}</span>}
        </span>
      </div>
      {bands.length > 0 && (
        <div className="timeline__bands" aria-hidden="true">
          {bands.flatMap((band) =>
            visibleBandSegments(band.mulai, band.akhir, mingguBerjalan, max).map(([start, end], i) => {
              const left = ((start - mingguBerjalan) / span) * 100;
              const width = ((end - start + 1) / span) * 100;
              return (
                <div
                  key={`${band.jenis}-${band.label}-${i}`}
                  className={`timeline__band timeline__band--${band.jenis}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={band.label}
                >
                  <span className="timeline__band-label">{band.label}</span>
                </div>
              );
            })
          )}
        </div>
      )}
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
