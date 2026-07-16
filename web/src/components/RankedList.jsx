import { riskColor } from "../lib/riskColor.js";
import { KOTA_IDS } from "../lib/wilayah.js";

export default function RankedList({ mapData, minggu, onSelect }) {
  const ranked = mapData.kabupaten
    .filter((k) => !KOTA_IDS.has(k.id))
    .map((k) => {
      const entry = k.risk_mingguan.find((r) => r.minggu === minggu);
      return { id: k.id, nama: k.nama, skor: entry ? entry.skor : 0 };
    })
    .sort((a, b) => b.skor - a.skor);

  return (
    <div className="ranked-list">
      {ranked.map((k, i) => (
        <button
          key={k.id}
          type="button"
          className="ranked-list__row"
          onClick={() => onSelect(k.id)}
        >
          <span className="ranked-list__rank">{i + 1}</span>
          <span className="ranked-list__swatch" style={{ background: riskColor(k.skor) }} />
          <span className="ranked-list__name">{k.nama}</span>
          <span className="ranked-list__score">{k.skor}</span>
        </button>
      ))}
    </div>
  );
}
