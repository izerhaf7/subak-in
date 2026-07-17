import { useEffect, useState } from "react";
import PetaHidup from "../components/PetaHidup.jsx";
import { loadGeo, loadMap } from "../lib/loadData.js";
import { useT } from "../lib/i18n.jsx";

const KOMODITAS_ID = "cabai_rawit";

export default function Beranda({ onMasuk }) {
  const { t } = useT();
  const [geo, setGeo] = useState(null);
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    let batal = false;

    // Kegagalan bagian mana pun tidak boleh memblokir halaman depan — pola
    // yang sama dengan loadWeather() di App.jsx. Lebih baik hero tanpa peta
    // daripada pintu yang macet.
    loadGeo().then((g) => { if (!batal) setGeo(g); }).catch(() => { });
    loadMap(KOMODITAS_ID).then((m) => { if (!batal) setMapData(m); }).catch(() => { });

    return () => { batal = true; };
  }, []);

  return (
    <div className="beranda">
      <div className="beranda__hero">
        <div className="beranda__copy">
          <h1 className="beranda__headline">
            {t("beranda_headline_1")}
            <br />
            <em className="beranda__headline-aksen">{t("beranda_headline_2")}</em>
          </h1>

          <p className="beranda__sub">{t("beranda_sub")}</p>

          <div className="beranda__cta">
            <button type="button" className="btn-primary" onClick={() => onMasuk("peta_simulasi")}>
              {t("beranda_cta_utama")}
            </button>
            <button type="button" className="beranda__btn-kedua" onClick={() => onMasuk("panen_darurat")}>
              {t("beranda_cta_kedua")}
            </button>
          </div>
        </div>

        <div className="beranda__peta">
          <PetaHidup geo={geo} mapData={mapData} />
        </div>
      </div>
    </div>
  );
}
