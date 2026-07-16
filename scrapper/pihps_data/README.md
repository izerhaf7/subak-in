# PIHPS Price Data (bi.go.id/hargapangan)

Historical price data scraped from Bank Indonesia's PIHPS (Pusat Informasi
Harga Pangan Strategis) for **Panen Radar**'s glut-detection model. Scraped once
ahead of time and cached to disk — the dashboard reads these files, it never
hits bi.go.id live during a demo.

## Two data pulls, two endpoints, two purposes

1. **Province-level, multi-province, multi-province-commodity breadth** —
   `cabai_prices.csv` (5 Java provinces + DKI, all 4 cabai variants, Produsen).
   Built with `scrape()` / `GetGridDataDaerah`. Good for "how does the
   province-wide average move," bad for "is this a real production sentra."
2. **Regency-level, single-province, sentra-validated Tier-1/Tier-2 pull** —
   `tier1_producer_prices.csv`, `tier2_producer_prices.csv`,
   `all_producer_prices.csv`, `coverage_manifest.json` (Jawa Barat only, back
   to Sep 2018). Built with `scrape_komoditas()` / `GetGridDataKomoditas`.
   This is the one that matters for glut *detection* (see "Tier system" below)
   because it tells you not just "is there a price" but "is there a price
   **at the kabupaten that actually grows this crop**."

Both endpoints coexist in `pihps_scraper.py`; see each section below for which
to use when.

## How to re-run

```
pip install requests pandas pyarrow
python pihps_scraper.py
```

This regenerates `refs.json`, one raw JSON file per (province, month-chunk)
under `raw/`, and the combined `cabai_prices.csv` / `cabai_prices.parquet`.
To pull a different commodity/province/date-range combo, call `scrape()`
directly instead of running the script:

```python
from pihps_scraper import scrape, save_combined

df = scrape(
    commodities=["Cabai Rawit Merah"],
    provinces=["Jawa Timur", "Jawa Tengah"],
    start_date="2023-01-01",
    end_date="2026-07-13",
    price_type_id=4,  # Produsen
)
save_combined(df, name="cabai_rawit_merah_jatim_jateng")
```

## Files

- `refs.json` — id lookups (commodity/category, province, price type), fetched
  once and cached. Delete it (or pass `force=True` to `build_refs`) to refresh.
- `raw/daerah_provinsi/<province>_pt<price_type_id>_<start>_<end>_<timestamp>.json` —
  untouched `GetGridDataDaerah` response for every request (backs `cabai_prices.csv`).
- `raw/komoditas_kabupaten/<commodity>_<province>_pt<price_type_id>_<start>_<end>_<timestamp>.json` —
  untouched `GetGridDataKomoditas` response for every request (backs
  `tier1_producer_prices.csv` / `tier2_producer_prices.csv`).
- Both are pure audit trail — nothing in the pipeline reads `raw/` back to
  build a CSV, so the two subfolders existing side by side can't affect
  production output; they're split only for human auditability.
- `cabai_prices.csv` / `cabai_prices.parquet` — combined, tidy output. Columns:

  | column | meaning |
  |---|---|
  | `date` | ISO `YYYY-MM-DD` |
  | `province` | province name |
  | `regency` | always `"Semua Kota"` — see note below, this endpoint only gives province-wide data |
  | `market` | always `"Semua Pasar"` — same reason |
  | `commodity` | e.g. `Cabai Rawit Merah` |
  | `price_type_id` | 1-4, see table below |
  | `price_type` | human name of `price_type_id` |
  | `nominal_price` | price in Rupiah/kg, `NaN` if the market didn't report that day |

## Endpoint used

`GET https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah`

This is the correct endpoint for historical time series — confirmed by hitting
it directly and inspecting responses, not from guessing. Do **not** use
`Home/GetChartData` (only returns today's snapshot, not history — this was
tried first and produces empty/single-day results) or `TabelHarga/GetChartDaerah`
(only renders a default ~7-day preview, not a full range).

### `price_type_id` — confirmed via `GetType`

| id | name | notes |
|---|---|---|
| 1 | Pasar Tradisional | traditional/wet market, consumer level |
| 2 | Pasar Modern | supermarket, consumer level — consistently the highest price |
| 3 | Pedagang Besar | wholesaler |
| 4 | Produsen | farm-gate — consistently the lowest price, most direct glut signal |

Verified by comparing actual returned prices for the same commodity/province/date:
Produsen < Pedagang Besar < Pasar Tradisional < Pasar Modern, which matches the
expected real-world price ordering (each step adds a margin). `price_type_id`
values outside 1-4 return empty or garbage data (`"-"`/`"0"` placeholders).

### `tipe_laporan` — confirmed empirically (not documented anywhere on the site)

| value | behavior |
|---|---|
| **1** | **Daily** — one column per calendar day (`DD/MM/YYYY`), `"-"` where the market didn't report that day (mostly weekends). **This is what the scraper uses.** |
| 2 | Weekly — columns like `"Jun 2026 (IV)"` / `"Jul 2026 (I)"` (week-of-month buckets) |
| 3 | Monthly — columns like `"Jul 2026"` |
| 4, 5 | **Broken for historical pulls.** Regardless of `start_date`/`end_date` span, the response always collapses to a single column labeled with `start_date`, and that value is identical to what `tipe_laporan=1` returns for `start_date` alone — `end_date` is silently ignored. Confirmed by requesting a full month with `tipe_laporan=5` and getting back exactly one date column matching day 1 of the range. |
| 0, 6+ | invalid, returns `{"data": []}` |

This matters because the real-world capture used during recon (`tipe_laporan=5`
over a ~6 month range) almost certainly only returned **one day's** data, not
six months of history — worth knowing if that URL shows up again anywhere.

### Response shape

`GetGridDataDaerah` returns a **pivoted** grid: each row is a commodity or
category, each date is a column key (not a row). Example (`tipe_laporan=1`,
`price_type_id=4`, `province_id=12`, `comcat_id=com_16`, one week):

```json
{"data": [
  {"no": "I", "name": "Cabai Rawit", "level": 1, "01/07/2026": "35,750", "02/07/2026": "35,750", ...},
  {"no": 1,   "name": "Cabai Rawit Merah", "level": 2, "01/07/2026": "43,550", "02/07/2026": "43,550", ...}
]}
```

- `level: 1` rows are category rollups (e.g. "Cabai Rawit" covering both rawit
  variants) — **the scraper drops these** and keeps only `level: 2` (the actual
  commodity you asked for).
- Prices are Indonesian-formatted strings (`,` = thousands separator, not a
  decimal point) — `43,550` means Rp 43.550/kg. Parsed to `float` in the CSV.
- `"-"` means no report for that market/date; parsed to `NaN`.
- `no` uses Roman numerals for category rows and integers for commodity rows —
  not used by the parser, kept only because it's in the raw response.

### Important limitation: province-level only, no regency/market breakdown

- Passing multiple `province_id` values comma-joined (e.g. `"12,14,16"`) does
  **not** return one row per province — it silently averages all of them
  together into a single aggregate. To get per-province data you must call the
  endpoint once per province (`scrape()` does this in a loop).
- Passing a specific `regency_id` and/or `market_id` (even valid ones pulled
  from `GetRefMarket`) makes the endpoint return `{"data": []}` — empty. This
  endpoint only supports the province-wide average with `regency_id`/`market_id`
  left blank; there doesn't appear to be a per-market drilldown available
  through `GetGridDataDaerah`. That's why every row in the CSV has
  `regency = "Semua Kota"` and `market = "Semua Pasar"` — it's not a bug in
  the scraper, it's the ceiling of what this endpoint exposes.

### No hard row cap, but long ranges are slow

No pagination or row-count cap was found. A ~2.5 year daily request (`2024-01-01`
to `2026-07-13`) returned all 661 date columns correctly in ~17s. A 6.5-year
request timed out at 60s — server-side rendering just gets slow for very wide
date ranges. The scraper chunks every request into calendar-month windows to
stay fast and to be polite to a government server, then concatenates the
results client-side.

## Second endpoint: `GetGridDataKomoditas` — regency-level breakdown

`GetGridDataDaerah` (above) cannot give per-kabupaten data: passing a specific
`regency_id` returns `{"data": []}`. The site has a second family of report
pages — "...Komoditas" (per-commodity, e.g. `TabelHarga/ProdusenKomoditas`)
as opposed to "...Daerah" (per-region) — backed by a different endpoint that
*does* break down by regency, discovered by reading that page's embedded JS
(`OnBeforeSend`) rather than guessing:

```
GET https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataKomoditas
```

Params: `price_type_id`, `comcat_id` (**one commodity id only** — the site's
own JS reads `getSelectedRowKeys()[0]`, singular), `province_id`, `regency_id`
(blank = all), `showKota` / `showPasar` (booleans, as strings `"true"`/`"false"`),
`tipe_laporan`, `start_date`, `end_date`.

Response is again a flat pivoted list, but with a `level` hierarchy instead of
one row per commodity:

```json
{"data": [
  {"no":"I","name":"Semua Provinsi","level":0, ...},
  {"no":"II","name":"Jawa Barat","level":1, ...},
  {"no":1,"name":"Kab. Garut","level":2, "01/07/2026":"40,000", ...},
  {"no":"a","name":"Produsen Kab. Garut","level":3, "01/07/2026":"40,000", ...}
]}
```

- `level 0` = national rollup, `level 1` = province rollup — both skipped by the parser.
- `level 2` = **one row per reporting regency** (`showKota=true`) — this is
  the real per-kabupaten price, and the whole reason to use this endpoint
  over `GetGridDataDaerah`.
- `level 3` = one row per individual responder (`showPasar=true`), nested
  immediately after its parent `level 2` row in the flat list (there is no
  explicit foreign key — the parser tracks "current regency" as it walks the
  list top to bottom). Multiple responders in the same regency appear as
  multiple consecutive `level 3` rows.
- **Crucially: `regency_id` left blank returns every reporting regency in the
  province in ONE request** — unlike `GetGridDataDaerah`, no per-regency
  looping is needed. `scrape_komoditas()` only loops commodities x
  month-chunks, not regencies.

### What a "responder" actually is, per `price_type_id` (via `GetRefMarket`)

Checked directly by calling `GetRefMarket` for the same regency across all
four price types — this is a hard lock, not a guess:

| `price_type_id` | responder name pattern | example |
|---|---|---|
| 1 Pasar Tradisional | the regency name itself, one generic entry — not an individual market name | `"Kab. Garut"` |
| 2 Pasar Modern | real retail chain names | `"HYPERMART"`, `"YOGYA"` |
| 3 Pedagang Besar | individual wholesaler names + city code suffix | `"Aceng-BDG"`, `"H. Mukti-BDG"` |
| 4 Produsen | individual farmer / farmer-group / company names | `"Kelompok Tani Silih Riksa 4 - H. Bubun Bunyamin"`, `"PT Rajawali Nusindo"` |

None of these are literal "Pasar Anu" market names except that Pasar
Tradisional's own list is just the regency name — meaning PIHPS's "Pasar
Tradisional" figure is itself already a regency-level average, not a named
market's price.

### Two-tier commodity model (Jawa Barat, Produsen/`price_type_id=4`)

Having a Produsen responder in a kabupaten does **not** mean that kabupaten is
a real production sentra for that commodity — it just means someone reports a
farm-gate-ish price there. Cross-checked against BPS/opendata.jabarprov sentra
rankings (see Sources) to separate the two:

| Tier | Commodity | Sentra-monitored kabupaten | Note |
|---|---|---|---|
| **1 — validated** | Cabai Rawit Merah / Hijau | **Kab. Garut** | Garut is a genuine rawit sentra (BPS per-kecamatan production) |
| **1 — validated** | Bawang Merah Ukuran Sedang | **Kab. Cirebon** (provincial sentra #1, ~33%), **Kab. Garut** (#4, ~14%) | Stronger validation than rawit — the #1-ranked sentra is covered, not just a minor one |
| 2 — modeled only | Cabai Merah Besar / Keriting | none of its real sentra (Garut #1, Kab. Bandung #2, Cianjur #3) are Produsen-covered | Responders that DO exist (Kota Sukabumi, Cirebon, Tasikmalaya, Sumedang) aren't this variant's production centers — don't use for glut validation, breadth/UI only |
| gugur | Bawang Putih Ukuran Sedang | **zero** Produsen responders anywhere in Jabar | mostly imported anyway; out of scope |

Other non-horticulture commodities (Beras, Daging Ayam/Sapi, Telur, Minyak
Goreng, Gula Pasir) also have partial Produsen coverage in Jabar but weren't
in scope for this project (cobweb/glut dynamics are a horticulture-specific
concern) — see `coverage_manifest.json` if that ever changes.

### Known nuances baked into the manifest logic

- **Discontinued responders look identical to healthy ones unless you check
  the *last* real date, not just whether any real data exists.** Kota
  Bandung has real Produsen data for Cabai Merah Besar/Keriting and Bawang
  Merah from Sep 2018 — but nothing after **Sep 2020**. It's a dead
  responder, not a currently-active one. `build_coverage_manifest()` marks a
  regency `measured_discontinued` (vs `measured_active`) if its last real
  monthly bucket is more than ~2 months behind the probe's `end_date`.
- **Coverage can differ by commodity within the same regency.** Kab. Garut's
  Cabai Rawit Merah data starts Sep 2018, but Cabai Rawit **Hijau** in the
  same regency doesn't start until Sep 2020 — same kabupaten, different
  commodity, different depth. Never assume commodities in the same regency
  share a start date.
- **A narrow date-range snapshot can undercount active regencies.** A 7-day
  window (`2026-07-01`..`07`) for Bawang Merah initially looked like it
  covered only Garut/Cirebon/Sumedang — Kota Sukabumi didn't show up because
  its responder happened to have a gap that specific week, even though it
  was reporting as recently as Jun 2026 over a wider check. `build_coverage_manifest()`
  uses a wide multi-year monthly-aggregated (`tipe_laporan=3`) probe per
  commodity, not a short recent window, specifically to avoid this trap.
- **`JABAR_REGENCIES`** (in `pihps_scraper.py`) is the canonical 27-entry
  (9 kota + 18 kabupaten) list with the `"Kota "`/`"Kab. "` prefix that
  `GetGridDataKomoditas` itself uses in row labels — `GetRegencyAll`'s raw
  names lack this prefix and have ambiguous duplicate bare names (e.g. two
  entries both just called `"Bandung"`, one kota one kabupaten, no way to
  tell apart without cross-referencing id ranges). The manifest is built
  against this canonical list so kabupaten with zero data show up explicitly
  as `"no_data"` rather than being silently absent.

### `coverage_manifest.json` — first-class dashboard input

One entry per (province, regency, commodity, price_type_id) combination,
`status` is one of `measured_active` / `measured_discontinued` / `no_data`.
This is what a choropleth should read to decide whether to show a real PIHPS
price for a kabupaten or fall back to the BPS+KATAM modeled estimate — **do
not infer this from whether a price series merely exists in the CSV**, since
a discontinued responder still has historical rows.

## Retail overlay (`retail_overlay_prices.csv`) — optional, for the sentra-to-city lag demo

Same 3 Tier-1 commodities (Cabai Rawit Merah/Hijau, Bawang Merah), same
2018-09 to today range, same `GetGridDataKomoditas` endpoint, but
`price_type_id=1` (Pasar Tradisional) instead of 4 (Produsen). Confirms 9
reporting regencies: Kota Bandung, Kota Cirebon, Kota Tasikmalaya, Kota
Bekasi, Kota Bogor, Kota Depok, Kota Sukabumi, Kab. Cirebon, Kab. Tasikmalaya.
Retail prices are consistently above Produsen for the same commodity/date
(e.g. Cabai Rawit Merah: ~Rp52-60k/kg retail vs ~Rp32-38k/kg farm-gate) — the
margin the "glut signal travels from sentra to city with a lag" narrative
depends on. This dataset is breadth/demo-color, not glut ground-truth — the
farm-gate (Tier-1) series is what actually detects a glut.

## Reference lookups (`refs.json`)

Built once from three endpoints, called in this order:

1. `WebSite/TabelHarga/GetRefCommodityAndCategory` — commodity/category names
   to ids. `cat_N` = category (e.g. `cat_8` = "Cabai Rawit"), `com_N` = specific
   commodity (e.g. `com_16` = "Cabai Rawit Merah"). **Gotcha:** `com_14`
   ("Cabai Merah Keriting") has a trailing space in the DB name — the scraper
   matches on `.strip().lower()` to avoid missing it.
2. `WebSite/Home/GetProvinceAll` — province names to ids (1-34; id 0 is the
   "Semua Provinsi"/all-provinces placeholder, not a real province). **Gotcha:**
   passing the documented `filter=["province_id",0]` param returns only that
   one placeholder row — omit `filter` entirely (or pass `filter=[]`) to get
   the full list.
3. `WebSite/Home/GetType` — price type ids to names (see table above).

`GetRefMarket` (market lookup, cascading from a regency) was also probed and
works standalone, but turned out to be a dead end for this scraper since
`GetGridDataDaerah` rejects specific `regency_id`/`market_id` values (see
above) — it's not called by `scrape()`.

## Known data gap: DKI Jakarta has no Produsen (farm-gate) prices

The first full production run (Java + DKI, 2024-01-01 to 2026-07-13,
`price_type_id=4`/Produsen) returned **zero rows for DKI Jakarta** across the
entire range — every `raw/dki_jakarta_*.json` file is `{"data": []}`. This
isn't a scraper bug: Jakarta is a pure consumer/capital city with no chili
farms, so there's no farm-gate price to report. If the dashboard needs a
Jakarta price series, pull it with a different `price_type_id` (e.g. `1`
Pasar Tradisional or `2` Pasar Modern — consumer-level prices, which do exist
for Jakarta) rather than expecting Produsen data to appear.

The other 5 provinces (Jawa Barat, Jawa Tengah, Jawa Timur, DI Yogyakarta,
Banten) all returned full data: 4 commodities x 661 daily columns each
(2024-01-01 to 2026-07-13), 13,220 total rows, ~1.5% `NaN` (non-reporting
days, mostly weekends).

## Politeness

The scraper uses a shared `requests.Session`, a normal browser User-Agent, a
page-appropriate `Referer` header per price type, and a 1.5s sleep between every
request. A full Java+DKI (6 provinces) x 2.5-year pull is ~186 requests and
takes roughly 15 minutes — this is a "run once, cache to disk" tool, not
something to run repeatedly or in a loop.
