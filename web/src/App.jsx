import { useEffect, useState } from "react";
import PetaSimulasi from "./screens/PetaSimulasi.jsx";
import PanenDarurat from "./screens/PanenDarurat.jsx";
import Landing from "./screens/Landing.jsx";
import { loadMeta, loadWeather } from "./lib/loadData.js";
import { LangContext, useT } from "./lib/i18n.jsx";
import "./styles/tokens.css";

const NAV_ITEMS = [
  { id: "peta_simulasi", labelKey: "nav_peta_simulasi" },
  { id: "panen_darurat", labelKey: "nav_darurat" },
];

function AppShell() {
  const { t, lang } = useT();
  const [meta, setMeta] = useState(null);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  // Landing (hero/CTA) muncul SEBELUM shell aplikasi - tanpa topbar/sidebar -
  // bukan salah satu tab di sidebar (lihat komentar di Landing.jsx). masuk
  // jadi null selama landing tampil; begitu CTA diklik, terisi layar tujuan
  // dan shell (topbar+sidebar) baru dirender.
  const [masuk, setMasuk] = useState(null);
  const [screen, setScreen] = useState("peta_simulasi");
  const [komoditasId, setKomoditasId] = useState("cabai_rawit");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  if (!masuk) {
    return (
      <Landing
        onMasuk={(tujuan) => {
          setScreen(tujuan);
          setMasuk(tujuan);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        {/* Brand section: hamburger + logo grouped together, matching the
            sidebar's own footprint - collapsing the sidebar hides ONLY the
            logo alongside it (per user's explicit direction), leaving just
            the toggle visible so the control is never lost. Toggle is drawn
            as three CSS bars, not a Unicode/emoji glyph. */}
        <div className="app-topbar__brand">
          <button
            type="button"
            className="app-topbar__sidebar-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={t(sidebarCollapsed ? "sidebar_expand" : "sidebar_collapse")}
            title={t(sidebarCollapsed ? "sidebar_expand" : "sidebar_collapse")}
            aria-expanded={!sidebarCollapsed}
          >
            <span className="app-topbar__sidebar-toggle-bar" />
            <span className="app-topbar__sidebar-toggle-bar" />
            <span className="app-topbar__sidebar-toggle-bar" />
          </button>
          {!sidebarCollapsed && (
            <img src="/brand/subakin-logo.svg" alt="Logo Subak.In" className="app-topbar__logo" />
          )}
        </div>
        {weather && <span className="weather-badge">☁ {weatherBadgeText(weather)}</span>}
        <div className="app-topbar__spacer" />
        <LangToggle />
      </header>
      <div className="app-body">
        <nav className={sidebarCollapsed ? "app-sidebar app-sidebar--collapsed" : "app-sidebar"}>
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
              <span className="app-sidebar__label">{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
        {error && <p className="app-error">{t("load_error", { msg: error })}</p>}
        {!error && !meta && <p className="app-loading">{t("loading")}</p>}
        {!error && meta && screen === "peta_simulasi" && (
          <PetaSimulasi meta={meta} komoditasId={komoditasId} onKomoditasChange={setKomoditasId} />
        )}
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
