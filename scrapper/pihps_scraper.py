"""
PIHPS (bi.go.id/hargapangan) historical price scraper for Panen Radar.

Hits the internal AJAX endpoints behind the "TabelHarga" -> "Daerah" report
pages instead of parsing HTML, and instead of the homepage GetChartData
widget (which only ever returns a single day's snapshot, not history).

Verified against the live site on 2026-07-13 — see README.md in pihps_data/
for the full writeup of what price_type_id / tipe_laporan actually mean.

Usage:
    python pihps_scraper.py
"""

import calendar
import json
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests

BASE = "https://www.bi.go.id/hargapangan"
OUT_DIR = Path("pihps_data")
RAW_DIR = OUT_DIR / "raw"
# Two endpoints, two subfolders — keeps the province-level GetGridDataDaerah
# audit trail (backs cabai_prices.csv) separate from the regency-level
# GetGridDataKomoditas audit trail (backs tier1/tier2_producer_prices.csv).
# Purely a filesystem convenience: nothing in the pipeline reads raw/ back to
# build a CSV (the CSV comes straight from the parsed in-memory response), so
# this can't affect production output either way — it's just for audit hygiene.
RAW_DIR_DAERAH = RAW_DIR / "daerah_provinsi"
RAW_DIR_KOMODITAS = RAW_DIR / "komoditas_kabupaten"
REFS_PATH = OUT_DIR / "refs.json"
SLEEP_SECONDS = 1.5

# From GetType — confirmed by comparing actual returned prices (Produsen <
# Pedagang Besar < Pasar Tradisional < Pasar Modern, as expected economically).
PRICE_TYPES = {
    1: "Pasar Tradisional",
    2: "Pasar Modern",
    3: "Pedagang Besar",
    4: "Produsen",
}
# Each price type has its own "Daerah" report page; used only for a realistic Referer header.
REFERER_PAGE = {
    1: "PasarTradisionalDaerah",
    2: "PasarModernDaerah",
    3: "PedagangBesarDaerah",
    4: "ProdusenDaerah",
}

# tipe_laporan=1 is the only value that returns real daily granularity (one
# column per calendar day, "-" where a market didn't report). tipe_laporan=2
# buckets into "Mon YYYY (week-of-month)" columns, tipe_laporan=3 into
# "Mon YYYY" columns. tipe_laporan=4 and 5 are BROKEN for historical pulls:
# regardless of start_date/end_date span, they collapse to a single column
# labeled with start_date only (verified: value matches the tipe_laporan=1
# value for start_date and does not change with end_date). Do not use 4/5 for
# time series — this also means the 6-month example URL captured during
# recon most likely only returned one day's data, not history.
TIPE_LAPORAN_DAILY = 1


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
        "X-Requested-With": "XMLHttpRequest",
    })
    return s


def _epoch_ms() -> int:
    return int(time.time() * 1000)


def _get_with_retry(session: requests.Session, url: str, params: dict, referer: str, retries: int = 4, timeout: int = 45) -> requests.Response:
    """bi.go.id resets the connection under sustained load every so often
    (verified during a long multi-hundred-request Komoditas pull); retrying
    on a fresh connection clears it every time observed so far.
    """
    last_exc = None
    for attempt in range(retries):
        try:
            r = session.get(url, params=params, headers={"Referer": referer}, timeout=timeout)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            last_exc = e
            time.sleep(3)
    raise last_exc


def build_refs(session: requests.Session = None, force: bool = False) -> dict:
    """Fetch commodity/category, province, and price-type lookups; cache to refs.json."""
    if REFS_PATH.exists() and not force:
        return json.loads(REFS_PATH.read_text(encoding="utf-8"))

    session = session or _session()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    r = session.get(f"{BASE}/WebSite/TabelHarga/GetRefCommodityAndCategory", params={"_": _epoch_ms()}, timeout=20)
    r.raise_for_status()
    commodities = r.json()["data"]
    time.sleep(SLEEP_SECONDS)

    r = session.get(f"{BASE}/WebSite/Home/GetProvinceAll", params={"_": _epoch_ms()}, timeout=20)
    r.raise_for_status()
    provinces = r.json()["data"]
    time.sleep(SLEEP_SECONDS)

    r = session.get(f"{BASE}/WebSite/Home/GetType", params={"_": _epoch_ms()}, timeout=20)
    r.raise_for_status()
    price_types = r.json()["data"]

    refs = {"commodities": commodities, "provinces": provinces, "price_types": price_types}
    REFS_PATH.write_text(json.dumps(refs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved refs -> {REFS_PATH}")
    return refs


def _resolve_commodity(name: str, refs: dict) -> tuple[str, str]:
    target = name.strip().lower()
    for item in refs["commodities"]:
        # DB names can carry a trailing space (e.g. "Cabai Merah Keriting "); match on stripped name.
        if item["id"].startswith("com_") and item["name"].strip().lower() == target:
            return item["id"], item["name"].strip()
    raise ValueError(f"commodity not found in refs: {name!r}")


def _resolve_province(name: str, refs: dict) -> tuple[int, str]:
    target = name.strip().lower()
    for item in refs["provinces"]:
        if item["province_name"].strip().lower() == target:
            return item["province_id"], item["province_name"].strip()
    raise ValueError(f"province not found in refs: {name!r}")


def _month_chunks(start_date: str, end_date: str) -> list[tuple[str, str]]:
    """Split [start_date, end_date] into calendar-month windows.

    GetGridDataDaerah has no documented row cap, but multi-year daily ranges
    are slow enough server-side to time out (~60s+ for 6+ years); a ~2.5 year
    range took 17s. Chunking by month keeps each request fast and lets us
    resume/retry a single month instead of the whole range.
    """
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    chunks = []
    cur = start
    while cur <= end:
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        month_end = date(cur.year, cur.month, last_day)
        chunk_end = min(end, month_end)
        chunks.append((cur.isoformat(), chunk_end.isoformat()))
        cur = chunk_end + timedelta(days=1)
    return chunks


def _parse_price(raw) -> float | None:
    s = str(raw).strip()
    if s in ("-", ""):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def fetch_grid_daerah(
    session: requests.Session,
    price_type_id: int,
    comcat_ids: list[str],
    province_id: int,
    start_date: str,
    end_date: str,
    tipe_laporan: int = TIPE_LAPORAN_DAILY,
) -> dict:
    """Calls GetGridDataDaerah for one province and one date-range chunk.

    regency_id/market_id are always left blank: this endpoint returns a
    province-wide average when they're empty, but returns EMPTY data when a
    specific regency_id/market_id is passed (verified against real regency
    and market ids) — per-market drilldown isn't available through this
    endpoint. province_id also does NOT support comma-joined multi-select
    here: passing several provinces silently averages them together instead
    of returning one row per province, so callers must loop provinces
    one at a time (scrape() below does this).
    """
    params = {
        "price_type_id": price_type_id,
        "comcat_id": ",".join(comcat_ids),
        "province_id": province_id,
        "regency_id": "",
        "market_id": "",
        "tipe_laporan": tipe_laporan,
        "start_date": start_date,
        "end_date": end_date,
        "_": _epoch_ms(),
    }
    referer_page = REFERER_PAGE.get(price_type_id, "ProdusenDaerah")
    r = _get_with_retry(session, f"{BASE}/WebSite/TabelHarga/GetGridDataDaerah", params, f"{BASE}/TabelHarga/{referer_page}")
    return r.json()


def _save_raw(payload: dict, province_name: str, start_date: str, end_date: str, price_type_id: int) -> Path:
    RAW_DIR_DAERAH.mkdir(parents=True, exist_ok=True)
    safe_prov = re.sub(r"\W+", "_", province_name.strip().lower())
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RAW_DIR_DAERAH / f"{safe_prov}_pt{price_type_id}_{start_date}_{end_date}_{ts}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _grid_to_rows(payload: dict, province_name: str, price_type_id: int) -> list[dict]:
    rows = []
    for item in payload.get("data", []):
        if item.get("level") != 2:
            continue  # level 1 = category rollup (e.g. "Cabai Rawit"); we only want leaf commodities
        commodity_name = item["name"].strip()
        for key, val in item.items():
            if key in ("no", "name", "level"):
                continue
            try:
                iso_date = datetime.strptime(key, "%d/%m/%Y").date().isoformat()
            except ValueError:
                continue  # defensive: skip anything that isn't a DD/MM/YYYY column
            rows.append({
                "date": iso_date,
                "province": province_name,
                "regency": "Semua Kota",  # province-wide average — see README
                "market": "Semua Pasar",
                "commodity": commodity_name,
                "price_type_id": price_type_id,
                "price_type": PRICE_TYPES.get(price_type_id, str(price_type_id)),
                "nominal_price": _parse_price(val),
            })
    return rows


def scrape(
    commodities: list[str],
    provinces: list[str],
    start_date: str,
    end_date: str,
    price_type_id: int = 4,
    tipe_laporan: int = TIPE_LAPORAN_DAILY,
    sleep_seconds: float = SLEEP_SECONDS,
) -> pd.DataFrame:
    """Scrape daily historical prices for the given commodities/provinces/date range.

    Resolves human-readable commodity/province names to PIHPS ids via refs.json
    (built on first call), then loops provinces x monthly date-chunks, saving
    each raw response to pihps_data/raw/ and returning one tidy combined DataFrame.
    """
    session = _session()
    refs = build_refs(session)

    com_ids = []
    for c in commodities:
        cid, _ = _resolve_commodity(c, refs)
        com_ids.append(cid)

    chunks = _month_chunks(start_date, end_date)
    all_rows = []

    for prov_name in provinces:
        prov_id, prov_name_clean = _resolve_province(prov_name, refs)
        for chunk_start, chunk_end in chunks:
            print(f"fetching {prov_name_clean} {chunk_start}..{chunk_end} (price_type_id={price_type_id}) ...")
            try:
                payload = fetch_grid_daerah(
                    session, price_type_id, com_ids, prov_id, chunk_start, chunk_end, tipe_laporan
                )
            except requests.RequestException as e:
                print(f"  failed: {e}")
                time.sleep(sleep_seconds)
                continue
            _save_raw(payload, prov_name_clean, chunk_start, chunk_end, price_type_id)
            all_rows.extend(_grid_to_rows(payload, prov_name_clean, price_type_id))
            time.sleep(sleep_seconds)

    df = pd.DataFrame(all_rows)
    if not df.empty:
        df = df.sort_values(["province", "commodity", "date"]).reset_index(drop=True)
    return df


# Canonical Jawa Barat regency list, WITH the "Kota "/"Kab. " prefix that
# GetGridDataKomoditas itself uses in its row labels (GetRegencyAll's raw
# names lack this prefix and have duplicate bare names like "Bandung" for
# both the city and the regency, plus trailing-space typos — this table
# fixes both problems). Derived from GetRegencyAll(ref_prov_id=12): ids
# 27-33 + 93 (Cimahi) + 97 (Banjar) are the 9 kota; the rest are the 18
# kabupaten. Matches Jawa Barat's official 9 kota + 18 kabupaten count.
JABAR_REGENCIES = [
    "Kota Bandung", "Kota Cirebon", "Kota Tasikmalaya", "Kota Bekasi",
    "Kota Bogor", "Kota Depok", "Kota Sukabumi", "Kota Cimahi", "Kota Banjar",
    "Kab. Indramayu", "Kab. Garut", "Kab. Cianjur", "Kab. Majalengka",
    "Kab. Ciamis", "Kab. Bandung", "Kab. Karawang", "Kab. Subang",
    "Kab. Cirebon", "Kab. Bandung Barat", "Kab. Kuningan", "Kab. Tasikmalaya",
    "Kab. Bogor", "Kab. Bekasi", "Kab. Sumedang", "Kab. Sukabumi",
    "Kab. Pangandaran", "Kab. Purwakarta",
]


def fetch_grid_komoditas(
    session: requests.Session,
    price_type_id: int,
    comcat_id: str,
    province_id: int,
    start_date: str,
    end_date: str,
    regency_id: str = "",
    show_kota: bool = True,
    show_pasar: bool = True,
    tipe_laporan: int = TIPE_LAPORAN_DAILY,
) -> dict:
    """Calls GetGridDataKomoditas for ONE commodity across a whole province.

    Unlike GetGridDataDaerah (province-only, one province per request), this
    endpoint — behind the "...Komoditas" report pages rather than "...Daerah"
    — returns every reporting regency in the province in a SINGLE request
    when regency_id is left blank, with showKota/showPasar controlling
    whether rows go down to kabupaten/kota level (level 2) and/or individual
    responder level (level 3, nested immediately after its parent level-2
    row in the flat response list). level 0 = national rollup ("Semua
    Provinsi"), level 1 = the province rollup — both skipped by the parser.

    comcat_id here only accepts ONE commodity id at a time (mirrors the
    site's own JS, which reads getSelectedRowKeys()[0]) — comma-joining
    multiple ids was not tested/relied upon and shouldn't be assumed to work.
    """
    params = {
        "price_type_id": price_type_id,
        "comcat_id": comcat_id,
        "province_id": province_id,
        "regency_id": regency_id,
        "showKota": "true" if show_kota else "false",
        "showPasar": "true" if show_pasar else "false",
        "tipe_laporan": tipe_laporan,
        "start_date": start_date,
        "end_date": end_date,
        "_": _epoch_ms(),
    }
    referer_page = REFERER_PAGE.get(price_type_id, "ProdusenDaerah").replace("Daerah", "Komoditas")
    r = _get_with_retry(session, f"{BASE}/WebSite/TabelHarga/GetGridDataKomoditas", params, f"{BASE}/TabelHarga/{referer_page}")
    return r.json()


def _save_raw_komoditas(payload: dict, commodity_name: str, province_name: str, start_date: str, end_date: str, price_type_id: int) -> Path:
    RAW_DIR_KOMODITAS.mkdir(parents=True, exist_ok=True)
    safe_com = re.sub(r"\W+", "_", commodity_name.strip().lower())
    safe_prov = re.sub(r"\W+", "_", province_name.strip().lower())
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RAW_DIR_KOMODITAS / f"{safe_com}_{safe_prov}_pt{price_type_id}_{start_date}_{end_date}_{ts}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _komoditas_to_rows(payload: dict, province_name: str, commodity_name: str, price_type_id: int) -> list[dict]:
    rows = []
    current_regency = None
    for item in payload.get("data", []):
        level = item.get("level")
        if level == 2:
            current_regency = item["name"].strip()
            responder_name = None
            source_level = "kabupaten"
        elif level == 3:
            responder_name = item["name"].strip()
            source_level = "responden"
        else:
            continue  # level 0 = national rollup, level 1 = province rollup — not what we want here
        for key, val in item.items():
            if key in ("no", "name", "level"):
                continue
            try:
                iso_date = datetime.strptime(key, "%d/%m/%Y").date().isoformat()
            except ValueError:
                continue
            rows.append({
                "date": iso_date,
                "province": province_name,
                "regency": current_regency,
                "commodity": commodity_name,
                "price_type_id": price_type_id,
                "price_type": PRICE_TYPES.get(price_type_id, str(price_type_id)),
                "nominal_price": _parse_price(val),
                "source_level": source_level,
                "responder_name": responder_name,
            })
    return rows


def scrape_komoditas(
    commodities: list[str],
    province: str,
    start_date: str,
    end_date: str,
    price_type_id: int = 4,
    tipe_laporan: int = TIPE_LAPORAN_DAILY,
    show_kota: bool = True,
    show_pasar: bool = True,
    sleep_seconds: float = SLEEP_SECONDS,
) -> pd.DataFrame:
    """Scrape daily regency-level (+ optional responder-level) prices for one
    province, one price_type, across a list of commodities, via
    GetGridDataKomoditas. Regency looping is NOT needed here — every
    reporting regency in the province comes back in one request per
    (commodity, month-chunk); only the commodity list and date range are
    looped client-side.
    """
    session = _session()
    refs = build_refs(session)
    prov_id, prov_name = _resolve_province(province, refs)
    chunks = _month_chunks(start_date, end_date)
    all_rows = []

    for com_name in commodities:
        com_id, com_name_clean = _resolve_commodity(com_name, refs)
        for chunk_start, chunk_end in chunks:
            print(f"fetching {com_name_clean} / {prov_name} {chunk_start}..{chunk_end} (pt={price_type_id}) ...")
            try:
                payload = fetch_grid_komoditas(
                    session, price_type_id, com_id, prov_id, chunk_start, chunk_end,
                    show_kota=show_kota, show_pasar=show_pasar, tipe_laporan=tipe_laporan,
                )
            except requests.RequestException as e:
                print(f"  failed: {e}")
                time.sleep(sleep_seconds)
                continue
            _save_raw_komoditas(payload, com_name_clean, prov_name, chunk_start, chunk_end, price_type_id)
            all_rows.extend(_komoditas_to_rows(payload, prov_name, com_name_clean, price_type_id))
            time.sleep(sleep_seconds)

    df = pd.DataFrame(all_rows)
    if not df.empty:
        df = df.sort_values(["commodity", "regency", "source_level", "date"]).reset_index(drop=True)
    return df


def _is_active(last_real_label: str, end_date: str, tipe_laporan: int) -> bool:
    """A regency/responder is 'active' if its last real value falls within
    ~2 reporting periods of end_date, vs 'discontinued' if it stopped long
    ago (e.g. Kota Bandung's Cabai/Bawang Merah Produsen data: real from
    Sep 2018 but nothing after Sep 2020 — clearly a dead responder, not a
    live one that just happens to have this month missing).
    """
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    try:
        if tipe_laporan == 3:  # monthly buckets like "Sep 2018"
            last = datetime.strptime(last_real_label, "%b %Y").date()
            months_gap = (end.year - last.year) * 12 + (end.month - last.month)
            return months_gap <= 2
        last = datetime.strptime(last_real_label, "%d/%m/%Y").date()
        return (end - last).days <= 45
    except ValueError:
        return False


def build_coverage_manifest(
    commodities: list[str],
    province: str,
    price_type_ids: tuple[int, ...] = (4,),
    probe_start_date: str = "2015-01-01",
    probe_end_date: str = None,
    all_regencies: list[str] = None,
    sleep_seconds: float = SLEEP_SECONDS,
) -> list[dict]:
    """For each (commodity, price_type) pair, discovers every regency that
    EVER reported real data (via one cheap monthly-aggregated wide-range
    request per pair — no daily chunking needed just to map coverage), then
    cross-references against the full canonical regency list so kabupaten
    with zero data are recorded explicitly as "no_data" rather than silently
    omitted. This manifest is what the dashboard's choropleth should read to
    decide "measured" (real PIHPS Produsen price) vs "modeled" (BPS+KATAM
    estimate only) per kabupaten.
    """
    probe_end_date = probe_end_date or date.today().isoformat()
    all_regencies = all_regencies or JABAR_REGENCIES
    session = _session()
    refs = build_refs(session)
    prov_id, prov_name = _resolve_province(province, refs)

    manifest = []
    for com_name in commodities:
        com_id, com_name_clean = _resolve_commodity(com_name, refs)
        for pt in price_type_ids:
            print(f"mapping coverage: {com_name_clean} / {prov_name} (pt={pt}) ...")
            payload = fetch_grid_komoditas(
                session, pt, com_id, prov_id, probe_start_date, probe_end_date,
                show_kota=True, show_pasar=False, tipe_laporan=3,
            )
            found = {}
            for row in payload.get("data", []):
                if row.get("level") != 2:
                    continue
                cols = [(k, v) for k, v in row.items() if k not in ("no", "name", "level")]
                first_real = next((k for k, v in cols if str(v).strip() not in ("-", "")), None)
                last_real = next((k for k, v in reversed(cols) if str(v).strip() not in ("-", "")), None)
                found[row["name"].strip()] = (first_real, last_real)

            for regency_name in all_regencies:
                if regency_name in found:
                    first_real, last_real = found[regency_name]
                    status = "measured_active" if _is_active(last_real, probe_end_date, 3) else "measured_discontinued"
                else:
                    first_real = last_real = None
                    status = "no_data"
                manifest.append({
                    "province": prov_name,
                    "regency": regency_name,
                    "commodity": com_name_clean,
                    "price_type_id": pt,
                    "price_type": PRICE_TYPES.get(pt, str(pt)),
                    "status": status,
                    "first_real_month": first_real,
                    "last_real_month": last_real,
                })
            time.sleep(sleep_seconds)
    return manifest


def save_manifest(manifest: list[dict], name: str = "coverage_manifest") -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved -> {path} ({len(manifest)} entries)")


def save_combined(df: pd.DataFrame, name: str = "cabai_prices") -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUT_DIR / f"{name}.csv"
    df.to_csv(csv_path, index=False)
    print(f"saved -> {csv_path} ({len(df)} rows)")
    try:
        parquet_path = OUT_DIR / f"{name}.parquet"
        df.to_parquet(parquet_path, index=False)
        print(f"saved -> {parquet_path}")
    except ImportError:
        pass  # pyarrow/fastparquet not installed — CSV is the source of truth either way


CABAI_VARIANTS = [
    "Cabai Merah Besar",
    "Cabai Merah Keriting",
    "Cabai Rawit Hijau",
    "Cabai Rawit Merah",
]

# Tier 1: Produsen (farm-gate) data that lands in a genuine production sentra
# (confirmed against BPS/opendata.jabarprov sentra rankings — see pihps_data/README.md).
TIER1_COMMODITIES = ["Cabai Rawit Hijau", "Cabai Rawit Merah", "Bawang Merah Ukuran Sedang"]
# Tier 2: Produsen data exists, but not in this variant's actual sentra kabupaten —
# breadth for the dashboard's commodity dropdown, explicitly NOT for glut validation.
TIER2_COMMODITIES = ["Cabai Merah Besar", "Cabai Merah Keriting"]

PRODUCTION_START_DATE = "2018-09-01"  # earliest real data confirmed across all Tier-1/Tier-2 commodities


def run_regency_level_scrape(name: str, commodities: list[str], end_date: str = None) -> pd.DataFrame:
    """Runs scrape_komoditas for a commodity list at Produsen level (price_type_id=4)
    for Jawa Barat, saves the combined CSV/parquet, and returns the DataFrame.
    """
    end_date = end_date or date.today().isoformat()
    df = scrape_komoditas(
        commodities=commodities,
        province="Jawa Barat",
        start_date=PRODUCTION_START_DATE,
        end_date=end_date,
        price_type_id=4,
        show_kota=True,
        show_pasar=True,
    )
    save_combined(df, name=name)
    return df


if __name__ == "__main__":
    today = date.today().isoformat()

    tier1_df = run_regency_level_scrape("tier1_producer_prices", TIER1_COMMODITIES, today)
    tier2_df = run_regency_level_scrape("tier2_producer_prices", TIER2_COMMODITIES, today)

    combined = pd.concat([tier1_df, tier2_df], ignore_index=True)
    save_combined(combined, name="all_producer_prices")

    manifest = build_coverage_manifest(
        commodities=TIER1_COMMODITIES + TIER2_COMMODITIES + ["Bawang Putih Ukuran Sedang"],
        province="Jawa Barat",
        price_type_ids=(4,),
        probe_end_date=today,
    )
    save_manifest(manifest)
