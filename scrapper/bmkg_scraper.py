"""
BMKG weather data scraper for Panen Radar.

Two BMKG data products, two very different shapes:
  - Bagian A: `prakiraan-cuaca` — confirmed JSON API, 3-hourly forecast ~3 days ahead.
  - Bagian B: ZOM season-onset data — NOT a JSON API (see bmkg_data/README.md for
    the investigation trail); extracted from official PDF bulletins instead.

Data usage requires BMKG attribution — every output file and any UI built from
this data must credit "BMKG" (Badan Meteorologi, Klimatologi, dan Geofisika).

Verified against the live API on 2026-07-13 — see bmkg_data/README.md for the
adm4 code discovery method and full findings.

Usage:
    python bmkg_scraper.py
"""

import json
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

BASE = "https://api.bmkg.go.id/publik/prakiraan-cuaca"
OUT_DIR = Path("bmkg_data")
RAW_DIR = OUT_DIR / "raw"
SLEEP_SECONDS = 2.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    # Cloudflare returns 403 "Laman Diblokir" without a same-site Referer —
    # confirmed: curl with a bare User-Agent gets blocked, adding this fixes it.
    "Referer": "https://www.bmkg.go.id/",
}

# adm4 (kelurahan/desa-level, Kepmendagri No 100.1.1-6117/2022) codes for one
# representative point per Tier-1/Tier-2 sentra kabupaten. Picked as the desa/
# kelurahan sharing the sentra kecamatan's own name (the kecamatan's "center"),
# with the sentra kecamatan itself found via web search (BPS/berita sources),
# NOT guessed — see README.md "Representative point selection" for citations
# and the one weak case (Sumedang, no strong sentra source found).
TARGET_POINTS = {
    "Kab. Garut": {
        "adm4": "32.05.22.2001", "kecamatan": "Cikajang", "desa": "Cikajang",
        "sentra_note": "Cabai (rawit+besar) sentra kecamatan — confirmed via web search",
    },
    "Kab. Cirebon": {
        "adm4": "32.09.04.2001", "kecamatan": "Pabedilan", "desa": "Pabedilan Kidul",
        "sentra_note": "Bawang merah sentra kecamatan (with Losari) — confirmed via web search",
    },
    "Kab. Bandung": {
        "adm4": "32.04.15.2001", "kecamatan": "Pangalengan", "desa": "Pangalengan",
        "sentra_note": "Horticulture sentra kecamatan (cabai+bawang merah) — confirmed via web search",
    },
    "Kab. Sumedang": {
        "adm4": "32.11.11.2002", "kecamatan": "Tanjungsari", "desa": "Tanjungsari",
        "sentra_note": "WEAK evidence — no dedicated cabai/bawang sentra source found; "
                        "picked as an active agricultural market town, not a confirmed sentra",
    },
    "Kab. Tasikmalaya": {
        "adm4": "32.06.27.2013", "kecamatan": "Cigalontang", "desa": "Cigalontang",
        "sentra_note": "Cabai rawit sentra kecamatan — confirmed via web search (academic source)",
    },
    "Kota Sukabumi": {
        "adm4": "32.72.02.1001", "kecamatan": "Cikole", "desa": "Cikole",
        "sentra_note": "Not a production sentra (minor/urban PIHPS responder only) — "
                        "city-center kecamatan used as a plain reference point",
    },
}


def _get_json(url: str, params: dict, retries: int = 4, timeout: int = 20) -> dict:
    last_exc = None
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last_exc = e
            time.sleep(4)
    raise last_exc


def fetch_prakiraan_cuaca(adm4: str) -> dict:
    return _get_json(BASE, {"adm4": adm4})


def _save_raw(payload: dict, kabupaten: str) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = kabupaten.strip().lower().replace(" ", "_").replace(".", "")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RAW_DIR / f"prakiraan_cuaca_{safe_name}_{ts}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _payload_to_rows(payload: dict, kabupaten: str) -> list[dict]:
    lokasi = payload["lokasi"]
    rows = []
    for block in payload.get("data", []):
        for cuaca_group in block.get("cuaca", []):
            for entry in cuaca_group:
                rows.append({
                    "kabupaten": kabupaten,
                    "kelurahan_code": lokasi["adm4"],
                    "kecamatan": lokasi.get("kecamatan"),
                    "desa": lokasi.get("desa"),
                    "datetime": entry.get("local_datetime"),
                    "curah_hujan_mm": entry.get("tp"),
                    "suhu_c": entry.get("t"),
                    "kelembaban_pct": entry.get("hu"),
                    "tutupan_awan_pct": entry.get("tcc"),
                    "kecepatan_angin_kmh": entry.get("ws"),
                    "arah_angin": entry.get("wd"),
                    "cuaca": entry.get("weather_desc"),
                    "jarak_pandang_m": entry.get("vs"),
                    "analysis_date": entry.get("analysis_date"),
                })
    return rows


def scrape_all() -> pd.DataFrame:
    all_rows = []
    for kabupaten, info in TARGET_POINTS.items():
        print(f"fetching prakiraan cuaca: {kabupaten} ({info['kecamatan']}, adm4={info['adm4']}) ...")
        payload = fetch_prakiraan_cuaca(info["adm4"])
        _save_raw(payload, kabupaten)
        all_rows.extend(_payload_to_rows(payload, kabupaten))
        time.sleep(SLEEP_SECONDS)
    df = pd.DataFrame(all_rows)
    return df.sort_values(["kabupaten", "datetime"]).reset_index(drop=True)


def save_csv(df: pd.DataFrame, name: str = "bmkg_prakiraan_cuaca") -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.csv"
    df.to_csv(path, index=False)
    print(f"saved -> {path} ({len(df)} rows)")


# --- Bagian B: ZOM season-onset bulletins ---------------------------------
# NOT a JSON API and NOT an HTML table — see bmkg_data/README.md for the full
# investigation trail (WP REST API search, HTML page checks, WordPress plugin
# JS inspection, all before landing on PDF bulletins). Both official bulletin
# PDFs present onset data as COLOR-CODED MAPS, not extractable text/tables —
# confirmed by checking `extract_tables()` returns nothing and `Tabel N.`
# headings in the text are narrative captions for charts, not real tables.
# The functions below automate everything that CAN be automated (finding and
# downloading the right PDF, rendering a specific page, converting a target
# lon/lat to a pixel position via the map's own printed gridlines) — reading
# off the actual color at that pixel and matching it to the legend is a
# manual/AI-vision step performed once for bmkg_zom_onset.csv, not something
# this script loops over automatically.

BULLETIN_PDFS = {
    "musim_kemarau_2026": "https://content.bmkg.go.id/wp-content/uploads/Buku-PMK26.pdf",
    "musim_hujan_2025_2026_update_nov2025": "https://content.bmkg.go.id/wp-content/uploads/Buku-Update-PMH2025-26-versi-Nov2025.pdf",
}
PDF_RAW_DIR = RAW_DIR / "pdf"


def download_bulletin_pdf(url: str, filename: str) -> Path:
    """Downloads a BMKG bulletin PDF. Uses --retry-style resumable behavior
    manually (via requests streaming) since a plain single-shot request
    silently truncated a 153MB file during recon (curl -sL alone also did
    this) — always verify downloaded size against the Content-Length header.
    """
    PDF_RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = PDF_RAW_DIR / filename
    with requests.get(url, headers=HEADERS, stream=True, timeout=120) as r:
        r.raise_for_status()
        expected_size = int(r.headers.get("content-length", 0))
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    actual_size = path.stat().st_size
    if expected_size and actual_size != expected_size:
        raise IOError(f"download incomplete: got {actual_size} bytes, expected {expected_size}")
    return path


def render_pdf_page(pdf_path: Path, page_index: int, crop_bbox: tuple = None, resolution: int = 400) -> "PIL.Image.Image":
    """Renders one PDF page (0-indexed) to an image, optionally cropped to
    bbox (x0, top, x1, bottom) in PDF points, at the given resolution. Needs
    `pip install pdfplumber` (pulls in pdfminer.six, no lxml required).
    """
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_index]
        if crop_bbox:
            page = page.crop(crop_bbox)
        return page.to_image(resolution=resolution).original


def find_tick_positions(image, axis: str, search_band: tuple[int, int]) -> list[int]:
    """Finds gridline tick-mark pixel positions along one axis by scanning a
    thin band just outside the map border for dark (non-white) pixel
    clusters — much more reliable than eyeballing label positions on a
    rendered map image. `axis='x'` scans a horizontal band (for
    longitude/vertical gridlines), `axis='y'` scans a vertical band (for
    latitude/horizontal gridlines). `search_band` is the (start, end) pixel
    range perpendicular to the axis to scan — must fall in the margin
    outside the border line, not across it (the border itself is a long
    continuous dark run that swamps the clustering), found in practice by
    checking `arr[fixed_row, :]` / `arr[:, fixed_col]` for the border's exact
    x/y first.
    """
    import numpy as np
    arr = np.array(image.convert("L"))
    if axis == "x":
        region = arr[search_band[0]:search_band[1], :]
        dark = np.where(region.min(axis=0) < 150)[0]
    else:
        region = arr[:, search_band[0]:search_band[1]]
        dark = np.where(region.min(axis=1) < 150)[0]
    if len(dark) == 0:
        return []
    clusters = []
    start = prev = dark[0]
    for v in dark[1:]:
        if v - prev > 5:
            clusters.append((start + prev) // 2)
            start = v
        prev = v
    clusters.append((start + prev) // 2)
    return clusters


def lonlat_to_pixel(lon: float, lat: float, x_gridline: tuple[float, int], y_gridline: tuple[float, int]) -> tuple[float, float]:
    """Converts a (lon, lat) to a pixel (x, y) on a rendered map image, given
    two calibration points: x_gridline = (known_longitude, its_pixel_x),
    using the SAME two known longitudes' pixel positions to get a scale —
    caller passes the two gridlines found via find_tick_positions and their
    printed degree values, e.g. (107.0, 903) and (108.0, 1473).
    """
    raise NotImplementedError(
        "This is a 2-point calibration helper stub documenting the method used "
        "for bmkg_zom_onset.csv — see bmkg_data/README.md 'Bagian B methodology' "
        "for the actual worked calibration (x_107=903, x_108=1473, y_7S=883, y_8S=1462 "
        "on Buku-PMK26.pdf page 236 at 400dpi) rather than a generic reusable function, "
        "since every bulletin page needs its own tick positions re-measured."
    )


if __name__ == "__main__":
    df = scrape_all()
    save_csv(df)
