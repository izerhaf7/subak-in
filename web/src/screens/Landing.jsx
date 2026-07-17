import { useEffect, useState } from "react";
import PetaHidup from "../components/PetaHidup.jsx";
import { loadGeo, loadMap } from "../lib/loadData.js";
import { useT } from "../lib/i18n.jsx";

const KOMODITAS_ID = "cabai_rawit";

const FITUR_IDS = ["peta", "simulasi", "darurat"];
const FAQ_IDS = [1, 2, 3, 4, 5];

// Layar pembuka SEBELUM masuk app (bukan salah satu tab di sidebar) - tanpa
// topbar/sidebar chrome, murni hero + CTA + section penjelasan. Sebelumnya
// ini keliru dipasang sebagai item nav "Beranda" di dalam shell aplikasi,
// sejajar dengan Peta & Simulasi / Panen Darurat - salah tempat, karena
// isinya konten landing page (headline promosi, foto latar, tagline), bukan
// ringkasan kerja yang cocok untuk halaman dalam-app. onMasuk hanya dipanggil
// sekali untuk masuk shell.
export default function Landing({ onMasuk }) {
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
    <div className="landing">
      {/* Topbar landing terpisah dari .app-topbar (shell dalam-app) - link
          jangkar ke section di halaman yang sama, bukan navigasi antar
          layar seperti sidebar shell. */}
      <header className="landing-topbar">
        <img src="/brand/subakin-logo.svg" alt="Logo Subak.In" className="landing-topbar__logo" />
        <nav className="landing-topbar__nav">
          <a href="#landing-hero" className="landing-topbar__link">{t("landing_nav_beranda")}</a>
          <a href="#landing-fitur" className="landing-topbar__link">{t("landing_nav_fitur")}</a>
          <a href="#landing-faq" className="landing-topbar__link">{t("landing_nav_faq")}</a>
        </nav>
        <div className="landing-topbar__spacer" />
      </header>

      <div id="landing-hero" className="landing__hero">
        <div className="landing__copy">
          <h1 className="landing__headline">
            {t("beranda_headline_1")}
            <br />
            <em className="landing__headline-aksen">{t("beranda_headline_2")}</em>
          </h1>

          <p className="landing__sub">{t("beranda_sub")}</p>

          <div className="landing__cta">
            <button type="button" className="btn-primary" onClick={() => onMasuk("peta_simulasi")}>
              {t("beranda_cta_utama")}
            </button>
            <button type="button" className="landing__btn-kedua" onClick={() => onMasuk("panen_darurat")}>
              {t("beranda_cta_kedua")}
            </button>
          </div>
        </div>

        <div className="landing__peta">
          <PetaHidup geo={geo} mapData={mapData} />
        </div>
      </div>

      <section id="landing-fitur" className="landing-fitur">
        <h2 className="landing-fitur__title">{t("landing_fitur_title")}</h2>
        <p className="landing-fitur__sub">{t("landing_fitur_sub")}</p>

        <div className="landing-fitur__grid">
          {FITUR_IDS.map((id, i) => (
            <article
              key={id}
              className="landing-fitur__card"
              style={{ "--kpi-accent": i === 0 ? "var(--risk-high)" : i === 1 ? "var(--aksen)" : "var(--risk-critical)" }}
            >
              <h3 className="landing-fitur__card-judul">{t(`landing_fitur_${id}_judul`)}</h3>
              <p className="landing-fitur__card-desc">{t(`landing_fitur_${id}_desc`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="landing-faq" className="landing-faq">
        <h2 className="landing-faq__title">{t("landing_faq_title")}</h2>

        <div className="landing-faq__list">
          {FAQ_IDS.map((n) => (
            <details key={n} className="landing-faq__item">
              <summary className="landing-faq__question">{t(`landing_faq_${n}_q`)}</summary>
              <p className="landing-faq__answer">{t(`landing_faq_${n}_a`)}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
