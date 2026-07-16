import { useRef, useState } from "react";
import { riskColor } from "../lib/riskColor.js";
import { KOTA_IDS } from "../lib/wilayah.js";
import { useT } from "../lib/i18n.jsx";

const STATUS_KEY = {
  measured: "badge_measured",
  measured_stale: "badge_stale",
  modeled: "badge_modeled",
};

export default function JabarMap({ geo, mapData, minggu, selectedId, onSelect }) {
  const { t } = useT();
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const byId = Object.fromEntries(
    mapData.kabupaten.map((k) => {
      const entry = k.risk_mingguan.find((r) => r.minggu === minggu);
      return [k.id, { skor: entry ? entry.skor : 0, nama: k.nama, status: k.status_data }];
    })
  );

  function handleMove(id, e) {
    const rect = wrapRef.current.getBoundingClientRect();
    setHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const hoverInfo = hover ? byId[hover.id] : null;
  const hoverIsKota = hover ? KOTA_IDS.has(hover.id) : false;

  return (
    <div className="jabar-map-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={geo.viewBox}
        className="jabar-map"
        role="img"
        aria-label={t("map_aria")}
      >
        {geo.water && <path d={geo.water} fill="#a9c4d4" stroke="var(--bg)" strokeWidth={1} />}
        {Object.entries(geo.kabupaten).map(([id, shape]) => {
          const isKota = KOTA_IDS.has(id);
          return (
            <path
              key={id}
              d={shape.path}
              fill={isKota ? "#ffffff" : riskColor(byId[id]?.skor ?? 0)}
              stroke={isKota ? "var(--border-strong)" : "var(--bg)"}
              strokeWidth={1}
              className={
                id === selectedId
                  ? "jabar-map__region jabar-map__region--selected"
                  : "jabar-map__region"
              }
              role="button"
              tabIndex={0}
              aria-label={
                isKota
                  ? `${byId[id]?.nama ?? id} — ${t("kota_status")}`
                  : t("map_region_title", { nama: byId[id]?.nama ?? id, skor: byId[id]?.skor ?? 0 })
              }
              onClick={() => onSelect(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(id);
                }
              }}
              onMouseMove={(e) => handleMove(id, e)}
            />
          );
        })}
      </svg>
      {hoverInfo && (
        <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <span className="map-tooltip__nama">{hoverInfo.nama}</span>
          <span className="map-tooltip__detail">
            {hoverIsKota
              ? t("kota_status")
              : `${t("kpi_index", { n: hoverInfo.skor })} · ${t(STATUS_KEY[hoverInfo.status] ?? "badge_modeled")}`}
          </span>
        </div>
      )}
    </div>
  );
}
