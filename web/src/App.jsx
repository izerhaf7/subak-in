import { useEffect, useState } from "react";
import PetaSimulasi from "./screens/PetaSimulasi.jsx";
import PanenDarurat from "./screens/PanenDarurat.jsx";
import Beranda from "./screens/Beranda.jsx";
import { loadMeta, loadWeather } from "./lib/loadData.js";
import { LangContext, useT } from "./lib/i18n.jsx";
import "./styles/tokens.css";

const NAV_ITEMS = [
  { id: "beranda", labelKey: "nav_beranda" },
  { id: "peta_simulasi", labelKey: "nav_peta_simulasi" },
  { id: "panen_darurat", labelKey: "nav_darurat" },
];

function AppShell() {
  const { t, lang } = useT();
  const [meta, setMeta] = useState(null);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const [screen, setScreen] = useState("beranda");

  useEffect(() => {
    loadMeta().then(setMeta).catch((e) => setError(e.message));
    // Badge cuaca dari cache scrape — kegagalan bukan alasan blokir app,
    // cukup badge-nya saja yang tidak muncul.
    loadWeather().then(setWeather).catch(() => { });
  }, []);

  function weatherBadgeText(w) {
    const total = w.per_kabupaten.length;
    const rain = w.per_kabupaten.filter((k) => k.ringkas_3hari.some((h) => h.hujan_flag)).length;
    const date = new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
      day: "numeric",
      month: "short",
    }).format(new Date(w.diambil_pada));
    return t("weather_badge", { date, rain, total });
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <img src="/brand/subakin-logo.svg" alt="Logo Subak.In" className="app-topbar__logo" />
        <div className="app-topbar__spacer" />
        {weather && <span className="weather-badge">☁ {weatherBadgeText(weather)}</span>}
        {meta && (
          <span className="app-topbar__meta">
            {t("topbar_week", { prov: meta.provinsi, n: meta.minggu_berjalan })}
          </span>
        )}
        <LangToggle />
      </header>
      <div className="app-body">
        <nav className="app-sidebar">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === screen
                  ? "app-sidebar__item app-sidebar__item--active"
                  : "app-sidebar__item"
              }
              aria-current={item.id === screen ? "page" : undefined}
              onClick={() => setScreen(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        {error && <p className="app-error">{t("load_error", { msg: error })}</p>}
        {!error && !meta && <p className="app-loading">{t("loading")}</p>}
        {!error && meta && screen === "beranda" && <Beranda onMasuk={setScreen} />}
        {!error && meta && screen === "peta_simulasi" && <PetaSimulasi meta={meta} />}
        {!error && meta && screen === "panen_darurat" && <PanenDarurat />}
      </div>
    </div>
  );
}

function LangToggle() {
  return (
    <LangContext.Consumer>
      {({ lang, setLang }) => (
        <div className="lang-toggle" role="group" aria-label="Bahasa / Language">
          <button
            type="button"
            className={lang === "id" ? "lang-toggle__btn lang-toggle__btn--active" : "lang-toggle__btn"}
            aria-pressed={lang === "id"}
            onClick={() => setLang("id")}
          >
            ID
          </button>
          <button
            type="button"
            className={lang === "en" ? "lang-toggle__btn lang-toggle__btn--active" : "lang-toggle__btn"}
            aria-pressed={lang === "en"}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
      )}
    </LangContext.Consumer>
  );
}

export default function App() {
  const [lang, setLang] = useState("id");

  // WCAG 3.1.1: bahasa dokumen harus ikut bahasa antarmuka yang aktif,
  // supaya screen reader melafalkan teks dengan pengucapan yang benar.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <AppShell />
    </LangContext.Provider>
  );
}
