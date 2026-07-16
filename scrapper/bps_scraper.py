"""
BPS WebAPI production data scraper for Panen Radar.

Pulls annual production (Produksi) and harvested area (Luas Panen) for Cabai
Rawit, Cabai Besar/Keriting, and Bawang Merah across Jawa Barat kabupaten/kota.
This is Layer 0 (volume disaggregation) / Layer 3 (harvest-overlap supply
model) input — BPS supplies production SCALE and SEASONAL SHAPE, not price
(PIHPS) and not planting calendar (KATAM).

`stadata`'s own reshaping helper (view_dynamictable) crashes under the
installed pandas 3.x (it's pinned to pandas<3.0.0) and its list_dynamictable
has no server-side keyword filter, so this hits the raw BPS WebAPI JSON
directly and parses it — same approach as pihps_scraper.py.

Verified against the live BPS WebAPI on 2026-07-13 — see bps_data/README.md
for variable IDs, turvar meanings, and known granularity limitations.

Usage:
    python bps_scraper.py
"""

import json
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

BASE = "https://webapi.bps.go.id/v1/api"
API_KEY = "55c345f19eeb5570436e2018d5f774b3"
OUT_DIR = Path("bps_data")
RAW_DIR = OUT_DIR / "raw"
SLEEP_SECONDS = 2.0  # BPS webapi timed out under back-to-back calls during recon — more conservative than PIHPS

JABAR_DOMAIN = "3200"

# var_id=176 "Produksi Tanaman Sayuran Menurut Kabupaten/Kota" (unit: Kuintal).
# turvar 159 "Cabai" / 169 "Cabe Besar" identity confirmed empirically (not from
# any label alone) by cross-checking kabupaten rankings against the sentra found
# during PIHPS work: turvar 169 ranks Garut > Bandung > Cianjur every year
# 2015-2024, matching the known Cabai Besar sentra ranking -> 169 = Cabai
# Besar/Keriting, and by elimination 159 "Cabai" = Cabai Rawit.
PRODUKSI_VAR = 176
PRODUKSI_TURVAR = {
    "Bawang Merah": 158,
    "Cabai Rawit": 159,
    "Cabai Besar/Keriting": 169,
}

# var_id=174 "Luas Panen Tanaman Sayuran Menurut Kabupaten/Kota" (unit: Hektar).
# LIMITATION: this variable's cabai entry is a single combined "Cabai" (390) — it
# does NOT split Rawit vs Besar/Keriting the way var 176 (Produksi) does. Only
# Bawang Merah (152) has a matching split here; no var with the finer per-type
# split was found for Luas Panen (checked var 175/177 - don't exist; searched
# "Cabe"/"Cabai Besar"/"Cabai Rawit" keywords at domain 3200 - no matches).
LUAS_PANEN_VAR = 174
LUAS_PANEN_TURVAR = {
    "Bawang Merah": 152,
    "Cabai (Gabungan Rawit+Besar)": 390,
}

# Years 2015-2024 confirmed available for both var 174 and var 176 via model=th.
# BPS webapi hard-limits the `th` range param to 2 years per request ("The maximum
# allowed number of years for the 'th' parameter is 2" — returned as an error message
# when a wider range is requested), so every pull is chunked into pairs.
TH_PAIRS = [(115, 116), (117, 118), (119, 120), (121, 122), (123, 124)]

# Canonical Jawa Barat regency list, BPS domain_id -> "Kota "/"Kab. " prefixed name.
# Uses the SAME prefix convention as pihps_scraper.py's JABAR_REGENCIES so the two
# datasets join on `regency`/`kabupaten` directly — no separate alias table needed,
# since BPS domain codes (Kemendagri-independent) and PIHPS's own regency labels
# both resolve to this same canonical string. Derived from Client.list_domain():
# domain 3201-3218 = the 18 kabupaten, 3271-3279 = the 9 kota.
BPS_JABAR_DOMAINS = {
    "3200": "Provinsi Jawa Barat",
    "3201": "Kab. Bogor", "3202": "Kab. Sukabumi", "3203": "Kab. Cianjur",
    "3204": "Kab. Bandung", "3205": "Kab. Garut", "3206": "Kab. Tasikmalaya",
    "3207": "Kab. Ciamis", "3208": "Kab. Kuningan", "3209": "Kab. Cirebon",
    "3210": "Kab. Majalengka", "3211": "Kab. Sumedang", "3212": "Kab. Indramayu",
    "3213": "Kab. Subang", "3214": "Kab. Purwakarta", "3215": "Kab. Karawang",
    "3216": "Kab. Bekasi", "3217": "Kab. Bandung Barat", "3218": "Kab. Pangandaran",
    "3271": "Kota Bogor", "3272": "Kota Sukabumi", "3273": "Kota Bandung",
    "3274": "Kota Cirebon", "3275": "Kota Bekasi", "3276": "Kota Depok",
    "3277": "Kota Cimahi", "3278": "Kota Tasikmalaya", "3279": "Kota Banjar",
}
JABAR_REGENCIES = [v for k, v in BPS_JABAR_DOMAINS.items() if k != "3200"]

# Bagian A priority target: PIHPS Tier-1 + Tier-2 sentra, plus non-sentra
# comparison kabupaten (Kab. Bandung, Cianjur) that are real production centers
# but were notably ABSENT from PIHPS Produsen coverage.
TARGET_REGENCIES = [
    "Kab. Garut", "Kab. Cirebon", "Kab. Sumedang", "Kab. Tasikmalaya",
    "Kota Sukabumi", "Kab. Bandung", "Kab. Cianjur", "Kab. Majalengka",
]


def _get_json(url: str, retries: int = 4, timeout: int = 30) -> dict:
    last_exc = None
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=timeout)
            r.raise_for_status()
            data = r.json()
            if data is None:
                raise ValueError(f"null response (invalid var/domain/th?) from {url}")
            return data
        except (requests.RequestException, ValueError) as e:
            last_exc = e
            time.sleep(4)
    raise last_exc


def fetch_var_data(domain: str, var_id: int, th_range: tuple[int, int]) -> dict:
    """Calls model=data for one variable + one 2-year th window, across every
    vervar (region) within `domain` in a SINGLE request — for a province domain
    like 3200, this returns all 27 kabupaten/kota + the province total at once.
    """
    a, b = th_range
    url = f"{BASE}/list/model/data/domain/{domain}/var/{var_id}/th/{a}:{b}/key/{API_KEY}/"
    return _get_json(url)


def _save_raw(payload: dict, var_id: int, th_range: tuple[int, int]) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    a, b = th_range
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RAW_DIR / f"var{var_id}_th{a}-{b}_{ts}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _decode_var_payload(payload: dict, turvar_map: dict) -> list[dict]:
    """Decodes one model=data response into tidy rows for the given {label: turvar_id} map.

    BPS's `datacontent` keys are built by simple string concatenation of
    vervar_val + var_id + turvar_val + tahun_val + turth_val — confirmed
    empirically against a known example key, NOT fixed-width padding — so keys
    are reconstructed here from the response's own vervar/tahun/turtahun lists
    rather than assumed, making this robust to different var_id digit lengths.
    """
    var_id = payload["var"][0]["val"]
    datacontent = payload["datacontent"]
    rows = []
    for vervar in payload["vervar"]:
        regency = BPS_JABAR_DOMAINS.get(str(vervar["val"]), vervar["label"])
        for label, turvar_val in turvar_map.items():
            for tahun in payload["tahun"]:
                for turth in payload["turtahun"]:
                    key = f"{vervar['val']}{var_id}{turvar_val}{tahun['val']}{turth['val']}"
                    rows.append({
                        "regency": regency,
                        "commodity": label,
                        "year": int(tahun["label"]),
                        "value": datacontent.get(key),
                    })
    return rows


def pull_all() -> pd.DataFrame:
    """Pulls Produksi (var 176) and Luas Panen (var 174) for all 5 th-pairs
    (2015-2024), saves raw JSON per request, and returns one tidy DataFrame
    covering all 27 Jawa Barat kabupaten/kota (filter to TARGET_REGENCIES for
    the Bagian A focus set, or keep all 27 — both are in the same output).
    """
    produksi_rows, luas_panen_rows = [], []
    for th_pair in TH_PAIRS:
        print(f"fetching Produksi (var {PRODUKSI_VAR}) th={th_pair} ...")
        payload = fetch_var_data(JABAR_DOMAIN, PRODUKSI_VAR, th_pair)
        _save_raw(payload, PRODUKSI_VAR, th_pair)
        produksi_rows.extend(_decode_var_payload(payload, PRODUKSI_TURVAR))
        time.sleep(SLEEP_SECONDS)

        print(f"fetching Luas Panen (var {LUAS_PANEN_VAR}) th={th_pair} ...")
        payload = fetch_var_data(JABAR_DOMAIN, LUAS_PANEN_VAR, th_pair)
        _save_raw(payload, LUAS_PANEN_VAR, th_pair)
        luas_panen_rows.extend(_decode_var_payload(payload, LUAS_PANEN_TURVAR))
        time.sleep(SLEEP_SECONDS)

    produksi_df = pd.DataFrame(produksi_rows)
    produksi_df["produksi_ton"] = produksi_df["value"] / 10.0  # Kuintal -> Ton
    produksi_df = produksi_df.drop(columns=["value"])

    luas_panen_df = pd.DataFrame(luas_panen_rows).rename(columns={"value": "luas_panen_ha"})

    # Bawang Merah's commodity label matches in both -> real per-kabupaten productivity.
    # Cabai Rawit / Cabai Besar/Keriting have no match in luas_panen_df (which only
    # has "Bawang Merah" and the combined "Cabai (Gabungan Rawit+Besar)" label) so
    # they correctly come out of this left-join with luas_panen_ha = NaN, rather
    # than being fabricated from a mismatched combined denominator.
    merged = produksi_df.merge(luas_panen_df, on=["regency", "commodity", "year"], how="left")

    # Keep the combined-cabai Luas Panen figure as its own reference row instead of
    # discarding it or silently attaching it to one specific type.
    combined_lp = luas_panen_df[luas_panen_df["commodity"] == "Cabai (Gabungan Rawit+Besar)"].copy()
    combined_lp["produksi_ton"] = None

    full = pd.concat([merged, combined_lp], ignore_index=True)
    produksi_num = pd.to_numeric(full["produksi_ton"], errors="coerce")
    luas_panen_num = pd.to_numeric(full["luas_panen_ha"], errors="coerce").replace(0, pd.NA)
    full["produksi_ton"] = produksi_num
    full["luas_panen_ha"] = luas_panen_num
    full["produktivitas_ton_per_ha"] = produksi_num / luas_panen_num
    full = full.rename(columns={"regency": "kabupaten", "commodity": "komoditas", "year": "tahun"})
    full = full[["kabupaten", "komoditas", "tahun", "produksi_ton", "luas_panen_ha", "produktivitas_ton_per_ha"]]
    return full.sort_values(["komoditas", "kabupaten", "tahun"]).reset_index(drop=True)


def build_coverage_manifest(df: pd.DataFrame) -> list[dict]:
    """One entry per (kabupaten, komoditas) across all 27 canonical Jabar
    regencies x the 3 headline commodities — parallel to PIHPS's
    coverage_manifest.json so the two can be joined later. status is
    'no_data' (never reported), 'sparse' (<50% of the 10 years have a real
    value), or 'consistent' (>=50%).
    """
    manifest = []
    commodities = ["Bawang Merah", "Cabai Rawit", "Cabai Besar/Keriting"]
    for regency in JABAR_REGENCIES:
        for commodity in commodities:
            sub = df[(df["kabupaten"] == regency) & (df["komoditas"] == commodity)]
            non_null = sub[sub["produksi_ton"].notna()]
            years_with_data = len(non_null)
            if years_with_data == 0:
                status = "no_data"
            elif years_with_data < 5:
                status = "sparse"
            else:
                status = "consistent"
            manifest.append({
                "province": "Jawa Barat",
                "regency": regency,
                "commodity": commodity,
                "status": status,
                "years_with_data": years_with_data,
                "first_year": int(non_null["tahun"].min()) if years_with_data else None,
                "last_year": int(non_null["tahun"].max()) if years_with_data else None,
                "latest_produksi_ton": (
                    non_null.sort_values("tahun")["produksi_ton"].iloc[-1] if years_with_data else None
                ),
            })
    return manifest


def save_manifest(manifest: list[dict], name: str = "bps_coverage_manifest") -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved -> {path} ({len(manifest)} entries)")


def save_csv(df: pd.DataFrame, name: str = "bps_production_data") -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.csv"
    df.to_csv(path, index=False)
    print(f"saved -> {path} ({len(df)} rows)")


if __name__ == "__main__":
    full_df = pull_all()

    # Bagian A output: focus set (8 target regencies from PIHPS cross-reference)
    target_df = full_df[full_df["kabupaten"].isin(TARGET_REGENCIES)].reset_index(drop=True)
    save_csv(target_df, name="bps_production_data")

    # Keep the full 27-regency pull too — same request cost, no reason to discard it.
    save_csv(full_df, name="bps_production_data_all_regencies")

    manifest = build_coverage_manifest(full_df)
    save_manifest(manifest)
