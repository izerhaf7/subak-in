import { useEffect, useState } from "react";
import PetaHidup from "../components/PetaHidup.jsx";
import AngkaMasalah from "../components/AngkaMasalah.jsx";
import { loadGeo, loadMap, loadKabupaten } from "../lib/loadData.js";
import { sorotanHarga, mingguPuncakRisiko } from "../lib/sorotan.js";
import { KOTA_IDS } from "../lib/wilayah.js";
import { useT } from "../lib/i18n.jsx";

const KOMODITAS_ID = "cabai_rawit";

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

    loadMap(KOMODITAS_ID)
      .then(async (m) => {
        if (batal) return;
        setMapData(m);

        // Kota dikecualikan di sini juga: bukan cuma di sorotanHarga, supaya
        // file-nya tidak diambil sama sekali — bukan cuma kalah skor.
        const measured = m.kabupaten.filter(
          (k) => k.status_data === "measured" && !KOTA_IDS.has(k.id)
        );
        const files = await Promise.all(
          measured.map((k) => loadKabupaten(k.id, KOMODITAS_ID).catch(() => null))
        );
        if (batal) return;
        setSorotan(sorotanHarga(m, files.filter(Boolean)));
      })
      .catch(() => { });

    return () => { batal = true; };
  }, []);

  const jumlahKabupaten = mapData
    ? mapData.kabupaten.filter((k) => !KOTA_IDS.has(k.id)).length
    : null;
  const horizonMinggu = meta?.label_minggu?.length ?? 0;
  const puncak = mapData ? mingguPuncakRisiko(mapData) : null;
  const komoditasNama =
    meta?.komoditas?.find((k) => k.id === KOMODITAS_ID)?.nama ?? KOMODITAS_ID;

  return (
    <div className="beranda">
      <div className="beranda__hero">
        <div className="beranda__copy">
          <h1 className="beranda__headline">
            {t("beranda_headline_1")}
            <br />
            <em className="beranda__headline-aksen">{t("beranda_headline_2")}</em>
          </h1>

          {jumlahKabupaten != null && (
            <p className="beranda__sub">
              {t("beranda_sub", { kab: jumlahKabupaten, minggu: horizonMinggu })}
            </p>
          )}

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

      <AngkaMasalah
        sorotan={sorotan}
        horizonMinggu={horizonMinggu}
        mingguPuncak={puncak?.minggu ?? null}
        komoditasNama={komoditasNama}
      />
    </div>
  );
}
