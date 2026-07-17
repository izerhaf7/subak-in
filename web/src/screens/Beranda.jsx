import { useEffect, useState } from "react";
import PetaHidup from "../components/PetaHidup.jsx";
import AngkaMasalah from "../components/AngkaMasalah.jsx";
import { loadGeo, loadMap, loadKabupaten } from "../lib/loadData.js";
import { sorotanHarga, mingguPuncakRisiko } from "../lib/sorotan.js";
import { KOTA_IDS } from "../lib/wilayah.js";
import { useT } from "../lib/i18n.jsx";

const KOMODITAS_ID = "cabai_rawit";
const HORIZON_MINGGU = 20; // matches model/run_all.py's FORECAST_HORIZON

export default function Beranda({ meta, onMasuk }) {
  const { t } = useT();
  const [geo, setGeo] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [sorotan, setSorotan] = useState(null);

  useEffect(() => {
    let batal = false;

    // Kegagalan bagian mana pun tidak boleh memblokir halaman depan — pola
    // yang sama dengan loadWeather() di App.jsx. Lebih baik hero tanpa peta
    // daripada pintu yang macet.
    loadGeo().then((g) => { if (!batal) setGeo(g); }).catch(() => { });
    loadMap(KOMODITAS_ID).then((m) => {
      if (batal) return;
      setMapData(m);

      // Hanya minta file kabupaten yang EKSPLISIT measured (dan bukan kota) -
      // bukan seluruh 27 wilayah - karena sorotanHarga hanya butuh itu, dan
      // meminta semuanya akan membuang-buang request untuk kabupaten modeled
      // yang tidak punya historis harga produsen sama sekali.
      const measuredIds = m.kabupaten
        .filter((k) => k.status_data === "measured" && !KOTA_IDS.has(k.id))
        .map((k) => k.id);

      Promise.all(measuredIds.map((id) => loadKabupaten(id, KOMODITAS_ID).catch(() => null)))
        .then((files) => { if (!batal) setSorotan(sorotanHarga(m, files)); })
        .catch(() => {});
    }).catch(() => { });

    return () => { batal = true; };
  }, []);

  const jumlahKabupaten = mapData
    ? mapData.kabupaten.filter((k) => !KOTA_IDS.has(k.id)).length
    : null;
  const mingguPuncak = mapData ? mingguPuncakRisiko(mapData)?.minggu : null;

  return (
    <div className="beranda">
      <div className="beranda__hero">
        <div className="beranda__copy">
          <h1 className="beranda__headline">
            {t("beranda_headline_1")}
            <br />
            <em className="beranda__headline-aksen">{t("beranda_headline_2")}</em>
          </h1>

          <p className="beranda__sub">
            {t("beranda_sub", { kab: jumlahKabupaten ?? 18, minggu: HORIZON_MINGGU })}
          </p>

          <div className="beranda__cta">
            <button type="button" className="btn-primary" onClick={() => onMasuk("peta_simulasi")}>
              {t("beranda_cta_utama")}
            </button>
            <button type="button" className="beranda__btn-kedua" onClick={() => onMasuk("panen_darurat")}>
              {t("beranda_cta_kedua")}
            </button>
          </div>

          <AngkaMasalah
            sorotan={sorotan}
            horizonMinggu={HORIZON_MINGGU}
            mingguPuncak={mingguPuncak}
            komoditasNama={meta?.komoditas?.find((k) => k.id === KOMODITAS_ID)?.nama ?? "Cabai Rawit"}
          />
        </div>

        <div className="beranda__peta">
          <PetaHidup geo={geo} mapData={mapData} />
        </div>
      </div>
    </div>
  );
}
