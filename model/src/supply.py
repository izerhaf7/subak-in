"""Weekly supply-side model: how much tonnage of a commodity is landing on the
market in a given week, per kabupaten. Two moving parts:

1. Luas panen allocation - BPS only publishes a COMBINED luas_panen_ha for
   cabai ("Cabai (Gabungan Rawit+Besar)"); Cabai Rawit / Cabai Besar/Keriting
   rows have produksi_ton but null luas_panen_ha (verified directly, see
   ingest.py). So per-variant luas is estimated as the combined luas split
   proportionally by each variant's share of combined produksi. Bawang Merah
   already has its own luas_panen_ha, no allocation needed there.
   # ASUMSI: proportional-by-production is a simplification (implicitly assumes
   # equal productivity for both cabai variants) - labeled in the output per
   # contract's "catatan_alokasi_luas" requirement, not hidden.

2. Planting cohorts -> harvest convolution. There's no micro-level planting-
   intention dataset, so the "current cohort" entering the ground is modeled
   as: (latest annual luas_panen_ha / assumed planting cycles per year), split
   across a small window of weeks whose shape depends on status_musim_hujan
   (contract: onset_diskrit = tight/synchronized window since farmers plant
   right after a known onset date; basah_kontinu = farmers can plant anytime,
   so more spread out; transisi = in between).
   # ASUMSI: cycles-per-year below are typical Jabar smallholder rotation
   # assumptions, NOT sourced from a citation - flagged for M3 review.
   Weekly tonnage is then this cohort (and the same repeating cohort shape from
   previous cycles, since a full year contains multiple overlapping harvest
   waves) convolved with the crop's harvest kernel from crop_constants.json.
"""
import json
import numpy as np
import pandas as pd

from aliases import DATA_CURATED

with open(DATA_CURATED / "crop_constants.json", encoding="utf-8") as f:
    CROP_CONSTANTS = json.load(f)

# Planting-cohort shape per status_musim_hujan, indexed by minggu_relatif from
# "now". Length of each list = geser_maks_minggu from the contract.
COHORT_PROFILE = {
    "onset_diskrit": [0.7, 0.3],                          # geser_maks_minggu=2
    "transisi_sebelum_cutoff": [0.4, 0.3, 0.2, 0.1],       # geser_maks_minggu=4
    "basah_kontinu": [0.30, 0.25, 0.20, 0.15, 0.07, 0.03],  # geser_maks_minggu=6
}
GESER_MAKS_MINGGU = {k: len(v) for k, v in COHORT_PROFILE.items()}

# ASUMSI: siklus tanam per tahun, belum ada sitasi - default masuk akal untuk
# hortikultura dataran tinggi/menengah Jabar.
CYCLES_PER_YEAR = {"cabai_rawit": 2, "bawang_merah": 3, "cabai_besar": 2}


def allocate_cabai_luas(bps_df: pd.DataFrame) -> pd.DataFrame:
    """Returns bps_df with cabai_rawit / cabai_besar luas_panen_ha filled in
    (proportional to each variant's produksi share of the combined total),
    leaving bawang_merah rows untouched (already has its own luas)."""
    df = bps_df.copy()
    gabungan = df[df["komoditas_id"] == "cabai_gabungan"][["region_id", "tahun", "luas_panen_ha"]]
    gabungan = gabungan.rename(columns={"luas_panen_ha": "luas_gabungan_ha"})

    cabai_mask = df["komoditas_id"].isin(["cabai_rawit", "cabai_besar"])
    cabai = df[cabai_mask].merge(gabungan, on=["region_id", "tahun"], how="left")
    totals = (
        cabai.groupby(["region_id", "tahun"])["produksi_ton"].transform("sum")
    )
    share = cabai["produksi_ton"] / totals.replace(0, np.nan)
    cabai["luas_panen_ha"] = cabai["luas_gabungan_ha"] * share
    cabai = cabai.drop(columns=["luas_gabungan_ha"])

    out = pd.concat([df[~cabai_mask], cabai], ignore_index=True)
    return out[out["komoditas_id"] != "cabai_gabungan"]


def latest_luas_dan_produktivitas(bps_allocated: pd.DataFrame, region_id: str, komoditas_id: str):
    """Most recent year with a usable luas_panen_ha + produktivitas for this
    (region, komoditas). Returns (luas_ha, produktivitas_ton_per_ha, tahun) or
    (None, None, None) if nothing usable exists (e.g. never grown there)."""
    sub = bps_allocated[
        (bps_allocated["region_id"] == region_id) & (bps_allocated["komoditas_id"] == komoditas_id)
    ].dropna(subset=["luas_panen_ha"])
    sub = sub[sub["luas_panen_ha"] > 0]
    if sub.empty:
        return None, None, None
    row = sub.sort_values("tahun").iloc[-1]
    produktivitas = row["produksi_ton"] / row["luas_panen_ha"] if row["luas_panen_ha"] else None
    return float(row["luas_panen_ha"]), float(produktivitas), int(row["tahun"])


def build_cohort_ha(luas_panen_ha: float, komoditas_id: str, status_musim_hujan: str) -> list:
    """Splits (luas_panen_ha / cycles_per_year) across a planting window shaped
    by status_musim_hujan. Returns [(minggu_relatif, luas_ha), ...]."""
    n_cycles = CYCLES_PER_YEAR[komoditas_id]
    per_cycle_ha = luas_panen_ha / n_cycles
    profile = COHORT_PROFILE[status_musim_hujan]
    return [(i, per_cycle_ha * frac) for i, frac in enumerate(profile)]


def harvest_convolution(luas_panen_ha: float, komoditas_id: str, status_musim_hujan: str,
                         weeks_out: int = 16) -> np.ndarray:
    """Weekly tonnage for the next `weeks_out` weeks (index 0 = minggu berjalan),
    modeling the ongoing pipeline as the same cohort shape repeating every
    cycle. Simulates cycles starting well before "now" through "now" so
    in-progress harvests (planted last cycle) are captured, not just brand-new
    plantings."""
    const = CROP_CONSTANTS[komoditas_id]
    kernel = np.array(const["bobot_mingguan"])
    mulai_panen_minggu = round(const["mulai_panen_hari"] / 7)
    panjang = len(kernel)

    n_cycles = CYCLES_PER_YEAR[komoditas_id]
    cycle_weeks = 52 / n_cycles
    cohort = build_cohort_ha(luas_panen_ha, komoditas_id, status_musim_hujan)
    produktivitas = None  # caller multiplies by produktivitas separately (see supply_weekly_ton)

    max_lookback_cycles = 4  # enough that no active harvest from an earlier cycle is missed
    total_span = weeks_out + int(max_lookback_cycles * cycle_weeks) + mulai_panen_minggu + panjang
    offset = int(max_lookback_cycles * cycle_weeks)
    out = np.zeros(offset + weeks_out)

    for c in range(-max_lookback_cycles, 1):
        cycle_start_week = offset + round(c * cycle_weeks)
        for minggu_relatif, ha in cohort:
            plant_week = cycle_start_week + minggu_relatif
            harvest_start = plant_week + mulai_panen_minggu
            for k, w in enumerate(kernel):
                week_idx = harvest_start + k
                if 0 <= week_idx < len(out):
                    out[week_idx] += ha * w  # ha * weight, produktivitas applied by caller

    return out[offset:offset + weeks_out]


def convolve_single_cohort(cohort_ha: list, komoditas_id: str, produktivitas_ton_per_ha: float,
                            weeks_out: int = 16) -> np.ndarray:
    """One-shot convolution (no cyclical repetition) of an explicit
    [(minggu_relatif, luas_ha), ...] cohort against the crop's harvest kernel -
    this is exactly the function simulasi.json's `test_vector` exists to let
    the frontend verify its JS port against, so kohort_tanam sliders in the UI
    can recompute the supply curve client-side without a round-trip to Python."""
    const = CROP_CONSTANTS[komoditas_id]
    kernel = np.array(const["bobot_mingguan"])
    mulai_panen_minggu = round(const["mulai_panen_hari"] / 7)

    out = np.zeros(weeks_out)
    for minggu_relatif, ha in cohort_ha:
        harvest_start = minggu_relatif + mulai_panen_minggu
        for k, w in enumerate(kernel):
            week_idx = harvest_start + k
            if 0 <= week_idx < weeks_out:
                out[week_idx] += ha * w * produktivitas_ton_per_ha
    return out


def supply_weekly_ton(bps_allocated: pd.DataFrame, region_id: str, komoditas_id: str,
                       status_musim_hujan: str, weeks_out: int = 16):
    """Full pipeline: latest BPS luas+produktivitas -> cohort -> convolution ->
    ton/week. Returns (weekly_ton: np.ndarray | None, luas_ha, produktivitas,
    tahun_sumber)."""
    luas_ha, produktivitas, tahun = latest_luas_dan_produktivitas(bps_allocated, region_id, komoditas_id)
    if luas_ha is None:
        return None, None, None, None
    ha_curve = harvest_convolution(luas_ha, komoditas_id, status_musim_hujan, weeks_out=weeks_out)
    return ha_curve * produktivitas, luas_ha, produktivitas, tahun
