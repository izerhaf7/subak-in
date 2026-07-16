"""Region id resolution: the single place that knows how to turn a raw regency
string from any of the three sources into one canonical kabupaten/kota id.

Discovery note (verified by direct inspection of the scraped exports, not
assumed): PIHPS coverage_manifest.json, BPS bps_production_data_all_regencies.csv,
and BMKG bmkg_zom_onset.csv / bmkg_prakiraan_cuaca.csv all already use the
identical human-readable "Kab. X" / "Kota Y" convention - no internal numeric ID
mismatch or trailing-space corruption survived into these exports. So the real
value of this module isn't cross-scheme translation, it's (a) one disambiguated
canonical id per kabupaten/kota - 6 names exist as both Kab. and Kota (Bandung,
Bogor, Cirebon, Bekasi, Sukabumi, Tasikmalaya) - and (b) a single choke point so
every ingest module joins through the same table instead of ad-hoc string
cleaning (the contract's golden rule).
"""
from pathlib import Path
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_RAW = ROOT_DIR / "data" / "raw"
DATA_CURATED = ROOT_DIR / "data" / "curated"
WEB_DATA = ROOT_DIR / "web" / "public" / "data"

ALIASES_PATH = DATA_CURATED / "region_aliases.csv"


class RegionAliases:
    def __init__(self, path: Path = ALIASES_PATH):
        if not path.exists():
            raise FileNotFoundError(
                f"region_aliases.csv tidak ditemukan di {path}. Ini blocker semua "
                "join lintas sumber - lihat data/curated/region_aliases.csv."
            )
        self.df = pd.read_csv(path, dtype=str)
        self.df["is_sentra_bmkg"] = self.df["is_sentra_bmkg"].map(
            lambda v: str(v).strip().lower() == "true"
        )
        self.df["lat"] = self.df["lat"].astype(float)
        self.df["lng"] = self.df["lng"].astype(float)

        self._pihps_to_id = dict(zip(self.df["pihps_regency"], self.df["id"]))
        self._bps_to_id = dict(zip(self.df["bps_kabupaten"], self.df["id"]))
        self._bmkg_to_id = {
            row["bmkg_kabupaten"]: row["id"]
            for _, row in self.df.iterrows()
            if row["bmkg_kabupaten"]
        }
        self._by_id = self.df.set_index("id").to_dict(orient="index")

    def _resolve(self, mapping: dict, raw_name: str, source_label: str) -> str:
        key = str(raw_name).strip()
        if key not in mapping:
            raise KeyError(
                f"'{raw_name}' dari {source_label} tidak ada di region_aliases.csv. "
                "Cek data/curated/region_aliases.csv - mungkin perlu baris baru."
            )
        return mapping[key]

    def from_pihps(self, regency: str) -> str:
        return self._resolve(self._pihps_to_id, regency, "PIHPS")

    def from_bps(self, kabupaten: str) -> str:
        return self._resolve(self._bps_to_id, kabupaten, "BPS")

    def from_bmkg(self, kabupaten: str) -> str:
        return self._resolve(self._bmkg_to_id, kabupaten, "BMKG")

    def all_ids(self) -> list:
        return self.df["id"].tolist()

    def sentra_bmkg_ids(self) -> list:
        return self.df.loc[self.df["is_sentra_bmkg"], "id"].tolist()

    def info(self, region_id: str) -> dict:
        if region_id not in self._by_id:
            raise KeyError(f"id kabupaten tidak dikenal: {region_id}")
        return self._by_id[region_id]

    def nama_pendek(self, region_id: str) -> str:
        return self.info(region_id)["nama_pendek"]

    def nama_resmi(self, region_id: str) -> str:
        return self.info(region_id)["nama_resmi"]

    def centroid(self, region_id: str) -> tuple:
        row = self.info(region_id)
        return (row["lat"], row["lng"])
