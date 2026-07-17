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

// Half the slider thumb's diameter (tokens.css `.timeline input[type=range]
// ::-webkit-slider-thumb`, 16px) - keep these in sync. A native range input's
// thumb travels within [inset, width-inset], not the raw 0-100% box, because
// the thumb can't overflow past its own edges. Without this correction, band
// and playhead positions computed from a plain 0-100% scale drift away from
// where the thumb actually sits as it nears either end.
const THUMB_INSET_PX = 8;

export default function TimelineSlider({ minggu, mingguBerjalan, labelMinggu, onChange, bands = [] }) {
  const { t } = useT();
  const max = mingguBerjalan + labelMinggu.length - 1;
  const isoLabel = labelMinggu[minggu - mingguBerjalan] ?? "";
  const totalWeeks = max - mingguBerjalan + 1;
  const span = max - mingguBerjalan;
  // Same point-on-[min,max] formula the native <input type="range"> uses
  // internally, so the playhead lines up exactly under the thumb rather than
  // just "close enough".
  const playheadRatio = span > 0 ? (minggu - mingguBerjalan) / span : 0;
  const playheadLeft = `calc(${THUMB_INSET_PX}px + (100% - ${THUMB_INSET_PX * 2}px) * ${playheadRatio})`;

  return (
    <div className="timeline">
      <div className="timeline__caption">
        <span>{t("timeline_title")}</span>
        <span className="timeline__label">
          {minggu === mingguBerjalan ? t("timeline_this_week") : t("week_n", { n: minggu })}
          {isoLabel && <span className="timeline__iso"> · {isoLabel}</span>}
        </span>
      </div>
      <div className="timeline__track">
        {bands.length > 0 && (
          <div className="timeline__bands" aria-hidden="true">
            {bands.flatMap((band) =>
              visibleBandSegments(band.mulai, band.akhir, mingguBerjalan, max).map(([start, end], i) => {
                const left = `calc(${THUMB_INSET_PX}px + (100% - ${THUMB_INSET_PX * 2}px) * ${(start - mingguBerjalan) / totalWeeks})`;
                const width = `calc((100% - ${THUMB_INSET_PX * 2}px) * ${(end - start + 1) / totalWeeks})`;
                return (
                  <div
                    key={`${band.jenis}-${band.label}-${i}`}
                    className={`timeline__band timeline__band--${band.jenis}`}
                    style={{ left, width }}
                    title={band.label}
                  >
                    <span className="timeline__band-label">{band.label}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
        <div className="timeline__playhead" aria-hidden="true" style={{ left: playheadLeft }} />
        <input
          type="range"
          min={mingguBerjalan}
          max={max}
          value={minggu}
          aria-label={t("timeline_pick")}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <div className="timeline__ends">
        <span>{t("now")}</span>
        <span>{t("timeline_end", { n: labelMinggu.length - 1 })}</span>
      </div>
    </div>
  );
}
