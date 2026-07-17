import { useT } from "../lib/i18n.jsx";

function formatRp(rp) {
  return `Rp${rp.toLocaleString("id-ID")}`;
}

// Semua angka di sini measured — tidak ada satupun yang modeled, jadi seluruh
// baris pakai .angka-terukur dan tidak ada yang perlu .angka-estimasi.
export default function AngkaMasalah({ sorotan, horizonMinggu, mingguPuncak, komoditasNama }) {
  const { t } = useT();

  return (
    <div className="angka-masalah">
      <div className="angka-masalah__row">
        {sorotan && (
          <>
            <div className="angka-masalah__col">
              <div className="angka-masalah__value angka-terukur">{sorotan.turunPersen}%</div>
              <div className="angka-masalah__label">
                {t("beranda_stat_turun_label", {
                  komoditas: komoditasNama,
                  nama: sorotan.nama,
                  n: sorotan.nMinggu,
                })}
              </div>
            </div>
            <div className="angka-masalah__col">
              <div className="angka-masalah__value angka-terukur">
                {formatRp(sorotan.puncakRp)} → {formatRp(sorotan.dasarRp)}
              </div>
              <div className="angka-masalah__label">{t("beranda_stat_rentang_label")}</div>
            </div>
          </>
        )}

        <div className="angka-masalah__col">
          <div className="angka-masalah__value angka-terukur">
            {t("beranda_stat_horizon_value", { n: horizonMinggu })}
          </div>
          <div className="angka-masalah__label">{t("beranda_stat_horizon_label")}</div>
        </div>

        {mingguPuncak != null && (
          <div className="angka-masalah__col">
            <div className="angka-masalah__value angka-terukur">
              {t("beranda_stat_puncak_value", { n: mingguPuncak })}
            </div>
            <div className="angka-masalah__label">{t("beranda_stat_puncak_label")}</div>
          </div>
        )}
      </div>

      {sorotan && (
        <p className="angka-masalah__sumber">
          {t("beranda_stat_sumber", { n: sorotan.nMinggu })}
        </p>
      )}
    </div>
  );
}
