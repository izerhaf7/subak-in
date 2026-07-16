import { useEffect, useState } from "react";
import { loadAbsorbers, loadMap } from "../lib/loadData.js";
import { useT, translateJenis } from "../lib/i18n.jsx";

function formatRp(v) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

export default function PanenDarurat() {
  const { t, lang } = useT();
  const [absorbers, setAbsorbers] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([loadAbsorbers(), loadMap("cabai_rawit")])
      .then(([a, m]) => {
        setAbsorbers(a);
        setMapData(m);
        setSelectedId(Object.keys(a.matches_per_kabupaten)[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="app-error">{t("load_error", { msg: error })}</p>;
  if (!absorbers || !mapData) return <p className="app-loading">{t("loading")}</p>;

  const absorberById = Object.fromEntries(absorbers.absorbers.map((a) => [a.id, a]));
  const namaById = Object.fromEntries(mapData.kabupaten.map((k) => [k.id, k.nama]));
  const kabupatenIds = Object.keys(absorbers.matches_per_kabupaten);
  const matches = absorbers.matches_per_kabupaten[selectedId] ?? [];
  const topMatch = matches[0] ? absorberById[matches[0].absorber_id] : null;

  return (
    <div className="peta-risiko">
      <div className="coverage-note">{t("dar_placeholder_note")}</div>
      <div className="kpi-row">
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("dar_surplus")}</span>
          <span className="kpi-chip__value">{namaById[selectedId] ?? selectedId}</span>
        </div>
        <div className="kpi-chip">
          <span className="kpi-chip__label">{t("dar_matched")}</span>
          <span className="kpi-chip__value">{matches.length}</span>
        </div>
        <div className="kpi-chip" style={{ borderRight: "none" }}>
          <span className="kpi-chip__label">{t("dar_best")}</span>
          <span className="kpi-chip__value">{topMatch ? topMatch.nama : "—"}</span>
        </div>
      </div>
      <div className="peta-risiko__body">
        <div className="peta-risiko__map-col">
          <div className="peta-risiko__map-head">
            <span className="peta-risiko__map-head-title">
              {t("dar_nearest", { nama: namaById[selectedId] ?? selectedId })}
            </span>
          </div>
          {matches.length === 0 ? (
            <p className="blind-spot-notice__text">{t("dar_none")}</p>
          ) : (
            <table className="absorber-table">
              <thead>
                <tr>
                  <th>{t("th_name")}</th>
                  <th>{t("th_type")}</th>
                  <th>{t("th_dist")}</th>
                  <th>{t("th_cap")}</th>
                  <th>{t("th_offer")}</th>
                  <th>{t("th_diff")}</th>
                  <th>{t("th_uplift")}</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const ab = absorberById[m.absorber_id];
                  if (!ab) return null;
                  const positif = m.selisih_vs_pasar_rp_per_kg >= 0;
                  return (
                    <tr key={m.absorber_id}>
                      <td>{ab.nama}</td>
                      <td>{translateJenis(ab.jenis, lang)}</td>
                      <td>{m.jarak_km} km</td>
                      <td>{ab.kapasitas_ton} ton</td>
                      <td className="angka-terukur">{formatRp(ab.harga_tawar_rp)}</td>
                      <td className={positif ? "absorber-table__diff--positif" : "absorber-table__diff--negatif"}>
                        {positif ? "+" : ""}
                        {formatRp(m.selisih_vs_pasar_rp_per_kg)}/kg
                      </td>
                      <td className={positif ? "absorber-table__diff--positif" : "absorber-table__diff--negatif"}>
                        {m.estimasi_uplift_juta >= 0 ? "+" : ""}
                        {m.estimasi_uplift_juta} {t("juta")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="side-col">
          <div className="side-col__title">
            <span>{t("dar_pick")}</span>
          </div>
          <p className="side-col__hint">{t("dar_pick_hint")}</p>
          <div className="ranked-list">
            {kabupatenIds.map((id) => (
              <button
                key={id}
                type="button"
                className={
                  id === selectedId ? "ranked-list__row ranked-list__row--active" : "ranked-list__row"
                }
                onClick={() => setSelectedId(id)}
              >
                <span className="ranked-list__name">{namaById[id] ?? id}</span>
                <span className="ranked-list__score">
                  {absorbers.matches_per_kabupaten[id].length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
