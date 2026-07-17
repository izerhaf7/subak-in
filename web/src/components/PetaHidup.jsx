import { useEffect, useMemo, useState } from "react";
import JabarMap from "./JabarMap.jsx";
import { mingguPuncakRisiko } from "../lib/sorotan.js";

const MS_PER_MINGGU = 700;

// tokens.css sudah mematikan transisi saat prefers-reduced-motion, tapi CSS
// tidak bisa menyentuh setInterval — jadi autoplay dicek manual di sini.
// Penjagaan typeof bukan basa-basi: jsdom tidak punya matchMedia sama sekali.
function inginDiam() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function PetaHidup({ geo, mapData }) {
  const mingguList = useMemo(
    () => (mapData?.kabupaten?.[0]?.risk_mingguan ?? []).map((r) => r.minggu),
    [mapData]
  );
  const puncak = useMemo(() => mingguPuncakRisiko(mapData), [mapData]);
  const [diam] = useState(inginDiam);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (diam || mingguList.length === 0) return undefined;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % mingguList.length);
    }, MS_PER_MINGGU);
    return () => clearInterval(id);
  }, [diam, mingguList.length]);

  if (!geo || !mapData || mingguList.length === 0) return null;

  // Kalau animasi dimatikan, minggu puncak yang ditampilkan — frame paling
  // informatif dari seluruh horizon, bukan minggu pertama yang kebetulan sepi.
  const minggu = diam ? puncak?.minggu ?? mingguList[0] : mingguList[idx];

  return (
    <div className="peta-hidup">
      <JabarMap
        geo={geo}
        mapData={mapData}
        minggu={minggu}
        selectedId={null}
        onSelect={() => {}}
        interaktif={false}
      />
    </div>
  );
}
