"""Read + clean the three raw sources, joining strictly through aliases.py
(never by raw string) per the contract's golden rule.

Commodity mapping (verified against actual unique values in the raw CSVs, not
assumed):
  PIHPS 'Cabai Rawit Hijau' + 'Cabai Rawit Merah'       -> cabai_rawit (mean of both)
  PIHPS 'Bawang Merah Ukuran Sedang'                    -> bawang_merah
  PIHPS 'Cabai Merah Besar' + 'Cabai Merah Keriting'    -> cabai_besar (mean of both)
  BPS   'Bawang Merah' / 'Cabai Rawit' / 'Cabai Besar/Keriting' -> same three ids
  BPS   'Cabai (Gabungan Rawit+Besar)' kept separate as cabai_gabungan - this is
        the ONLY row with luas_panen_ha for cabai (contract point #2: BPS cabai
        luas panen is combined-only; individual-variety rows have produksi but
        null luas_panen_ha, confirmed by direct check).
# ASUMSI: averaging Hijau/Merah and Besar/Keriting into one series per tier is a
# simplification - the two varieties can diverge in price. Documented here so
# it's auditable, not hidden.
"""
from pathlib import Path
import pandas as pd

from aliases import RegionAliases, DATA_RAW

PIHPS_COMMODITY_TO_KOMODITAS = {
    "Cabai Rawit Hijau": "cabai_rawit",
    "Cabai Rawit Merah": "cabai_rawit",
    "Bawang Merah Ukuran Sedang": "bawang_merah",
    "Cabai Merah Besar": "cabai_besar",
    "Cabai Merah Keriting": "cabai_besar",
}
KOMODITAS_TIER = {"cabai_rawit": 1, "bawang_merah": 1, "cabai_besar": 2}

BPS_KOMODITAS_TO_ID = {
    "Bawang Merah": "bawang_merah",
    "Cabai Rawit": "cabai_rawit",
    "Cabai Besar/Keriting": "cabai_besar",
    "Cabai (Gabungan Rawit+Besar)": "cabai_gabungan",
}

STATUS_MAP = {
    "measured_active": "measured",
    "measured_discontinued": "measured_stale",
    "no_data": "modeled",
}

ZOM_STATUS_MAP = {
    "transisi_sudah_terjadi_sebelum_cutoff": "transisi_sebelum_cutoff",
    "onset_diskrit_tersedia": "onset_diskrit",
    "tidak_ada_transisi_basah_kontinu": "basah_kontinu",
}


def _resolve_col(series: pd.Series, resolver) -> pd.Series:
    out = []
    unresolved = set()
    for v in series:
        try:
            out.append(resolver(v))
        except KeyError:
            unresolved.add(v)
            out.append(None)
    if unresolved:
        raise KeyError(f"Regency tidak dikenal di region_aliases.csv: {sorted(unresolved)}")
    return pd.Series(out, index=series.index)


def load_pihps_producer(ra: RegionAliases) -> pd.DataFrame:
    """Tier-1 + Tier-2 producer (farm-gate) prices, one row per (date, region, komoditas)."""
    t1 = pd.read_csv(DATA_RAW / "pihps" / "tier1_producer_prices.csv", parse_dates=["date"])
    t2 = pd.read_csv(DATA_RAW / "pihps" / "tier2_producer_prices.csv", parse_dates=["date"])
    df = pd.concat([t1, t2], ignore_index=True)
    df = df[df["commodity"].isin(PIHPS_COMMODITY_TO_KOMODITAS)].copy()
    df["region_id"] = _resolve_col(df["regency"], ra.from_pihps)
    df["komoditas_id"] = df["commodity"].map(PIHPS_COMMODITY_TO_KOMODITAS)
    df["tier"] = df["komoditas_id"].map(KOMODITAS_TIER)
    df = (
        df.groupby(["date", "region_id", "komoditas_id", "tier"], as_index=False)["nominal_price"]
        .mean()
    )
    return df.dropna(subset=["nominal_price"])


def load_pihps_retail_overlay(ra: RegionAliases) -> pd.DataFrame:
    df = pd.read_csv(DATA_RAW / "pihps" / "retail_overlay_prices.csv", parse_dates=["date"])
    df = df[df["commodity"].isin(PIHPS_COMMODITY_TO_KOMODITAS)].copy()
    df["region_id"] = _resolve_col(df["regency"], ra.from_pihps)
    df["komoditas_id"] = df["commodity"].map(PIHPS_COMMODITY_TO_KOMODITAS)
    df = (
        df.groupby(["date", "region_id", "komoditas_id"], as_index=False)["nominal_price"]
        .mean()
    )
    return df.dropna(subset=["nominal_price"])


def load_pihps_coverage(ra: RegionAliases) -> pd.DataFrame:
    """status_data per (region, komoditas), from PIHPS coverage_manifest.json."""
    import json

    with open(DATA_RAW / "pihps" / "coverage_manifest.json", encoding="utf-8") as f:
        records = json.load(f)
    df = pd.DataFrame.from_records(records)
    df = df[df["commodity"].isin(PIHPS_COMMODITY_TO_KOMODITAS)].copy()
    df["region_id"] = _resolve_col(df["regency"], ra.from_pihps)
    df["komoditas_id"] = df["commodity"].map(PIHPS_COMMODITY_TO_KOMODITAS)
    df["status_data"] = df["status"].map(STATUS_MAP)
    # Tier is measured if ANY underlying variant (e.g. Hijau or Merah) is measured -
    # take the "best" status per (region, komoditas_id) since we merged variants above.
    rank = {"measured": 0, "measured_stale": 1, "modeled": 2}
    df["rank"] = df["status_data"].map(rank)
    df = df.sort_values("rank").drop_duplicates(["region_id", "komoditas_id"], keep="first")
    return df[["region_id", "komoditas_id", "status_data"]]


def load_bps_production(ra: RegionAliases) -> pd.DataFrame:
    df = pd.read_csv(DATA_RAW / "bps" / "bps_production_data_all_regencies.csv")
    df = df[df["kabupaten"] != "Provinsi Jawa Barat"].copy()
    df = df[df["komoditas"].isin(BPS_KOMODITAS_TO_ID)].copy()
    df["region_id"] = _resolve_col(df["kabupaten"], ra.from_bps)
    df["komoditas_id"] = df["komoditas"].map(BPS_KOMODITAS_TO_ID)
    return df[["region_id", "komoditas_id", "tahun", "produksi_ton", "luas_panen_ha", "produktivitas_ton_per_ha"]]


def load_bps_unit_lahan(ra: RegionAliases) -> pd.DataFrame:
    df = pd.read_csv(DATA_RAW / "bps" / "bps_estimasi_unit_lahan.csv")
    df["region_id"] = _resolve_col(df["kabupaten"], ra.from_bps)
    return df


def load_bmkg_weather(ra: RegionAliases) -> pd.DataFrame:
    df = pd.read_csv(DATA_RAW / "bmkg" / "bmkg_prakiraan_cuaca.csv", parse_dates=["datetime"])
    df["region_id"] = _resolve_col(df["kabupaten"], ra.from_bmkg)
    return df


def load_bmkg_zom(ra: RegionAliases) -> pd.DataFrame:
    df = pd.read_csv(DATA_RAW / "bmkg" / "bmkg_zom_onset.csv")
    df["region_id"] = _resolve_col(df["kabupaten"], ra.from_bmkg)
    df["status_musim_hujan"] = df["status_musim_hujan"].map(ZOM_STATUS_MAP)
    if df["status_musim_hujan"].isna().any():
        unknown = df.loc[df["status_musim_hujan"].isna(), "kabupaten"].tolist()
        raise ValueError(f"status_musim_hujan tidak dikenal untuk: {unknown}")
    return df


def _sanity_check():
    ra = RegionAliases()
    print("=== ingest.py sanity check ===")

    producer = load_pihps_producer(ra)
    print(f"PIHPS producer: {len(producer)} baris, {producer['region_id'].nunique()} kabupaten, "
          f"tanggal {producer['date'].min().date()} - {producer['date'].max().date()}")
    print(producer.groupby("komoditas_id").size())

    retail = load_pihps_retail_overlay(ra)
    print(f"\nPIHPS retail overlay: {len(retail)} baris, {retail['region_id'].nunique()} kabupaten")

    coverage = load_pihps_coverage(ra)
    print(f"\nPIHPS coverage: {len(coverage)} baris")
    print(coverage.groupby(["komoditas_id", "status_data"]).size())

    bps = load_bps_production(ra)
    print(f"\nBPS production: {len(bps)} baris, {bps['region_id'].nunique()} kabupaten, "
          f"tahun {bps['tahun'].min()}-{bps['tahun'].max()}")
    print(bps.groupby("komoditas_id").size())

    unit_lahan = load_bps_unit_lahan(ra)
    print(f"\nBPS unit lahan: {len(unit_lahan)} baris (kabupaten only, kota tidak ada estimasi)")

    weather = load_bmkg_weather(ra)
    print(f"\nBMKG weather: {len(weather)} baris, {weather['region_id'].nunique()} kabupaten sentra, "
          f"{weather['datetime'].min()} - {weather['datetime'].max()}")

    zom = load_bmkg_zom(ra)
    print(f"\nBMKG ZOM onset: {len(zom)} baris")
    print(zom[["region_id", "status_musim_hujan"]])


if __name__ == "__main__":
    _sanity_check()
