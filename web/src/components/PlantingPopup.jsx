import { useT } from "../lib/i18n.jsx";

// Docked card shown when a sentra region is clicked on the merged Peta &
// Simulasi map. Lets the user shift that sentra's planting schedule
// (0..geser_maks_minggu weeks later) and see the baseline tanam/panen weeks
// it's anchored to. Non-sentra clicks get a lighter "can't simulate" notice
// instead (see PetaSimulasi.jsx — this component is only rendered for sentra).
export default function PlantingPopup({ kabupaten, geser, onChange, onClose }) {
  const { t } = useT();
  const isShifted = geser > 0;

  return (
    <aside className="kabupaten-panel planting-popup">
      <header className="kabupaten-panel__header">
        <h2>{kabupaten.nama}</h2>
        <button type="button" className="side-col__back" onClick={onClose}>
          {t("popup_close")}
        </button>
      </header>
      <p className="planting-popup__baseline">
        {t("popup_baseline", { w: kabupaten.baseline_tanam_minggu })}
      </p>
      <p className="planting-popup__status">{t(`status_${kabupaten.status_musim_hujan}`)}</p>
      {!kabupaten.zom_asli && (
        <p className="planting-popup__badge-generik">{t("popup_zom_generik")}</p>
      )}
      <div className="planting-popup__slider-row">
        <span className="planting-popup__slider-value">
          {isShifted
            ? t("plus_weeks", { n: geser })
            : t("popup_no_shift", { w: kabupaten.baseline_tanam_minggu })}
        </span>
        <input
          type="range"
          min={0}
          max={kabupaten.geser_maks_minggu}
          value={geser}
          aria-label={t("popup_slider_aria", { nama: kabupaten.nama })}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <p className="planting-popup__hint">{t("popup_hint")}</p>
    </aside>
  );
}
