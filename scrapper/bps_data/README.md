# BPS Production Data (webapi.bps.go.id)

Annual production (Produksi) and harvested area (Luas Panen) data from BPS
(Badan Pusat Statistik) for **Panen Radar**. This is the second of four data
sources (PIHPS, **BPS**, KATAM, BMKG).

## Role of this data (don't conflate with PIHPS/KATAM)

BPS is **not** a price source (that's PIHPS) and **not** a planting calendar
(that's KATAM). Its job here is **production scale and seasonal shape** —
disaggregating annual kabupaten-level production into a modeled weekly supply
baseline (technical report §5.1 "Layer 0 — Volume disaggregation" and §5.4
"Layer 3 — Harvest-overlap supply model"). All this pull provides is annual
production + harvested area per kabupaten, 2015-2024.

## How to re-run

```
python bps_scraper.py
```

Regenerates raw JSON under `raw/`, `bps_production_data.csv` (8 target
kabupaten), `bps_production_data_all_regencies.csv` (all 27), and
`bps_coverage_manifest.json`. Only 10 requests total (5 year-pairs x 2
variables) — takes well under a minute, no need to background it.

To pull different variables/years, call `pull_all()` after editing
`PRODUKSI_TURVAR` / `LUAS_PANEN_TURVAR` / `TH_PAIRS` in `bps_scraper.py`.

## Setup note: `stadata` package

The brief suggested `pip install stadata` over hand-rolled `requests`. Two
problems made this a dead end for the actual data pull:

1. `stadata==1.0.0` pins `lxml>=4.9.3,<5.0.0`, which has no prebuilt wheel for
   Python 3.14 on Windows and fails to build from source (missing libxml2 dev
   headers). Its actual source code (`main.py`, `material.py`, `__init__.py`)
   never imports `lxml` anywhere — it's a vestigial/unused pin. Installed with
   `pip install --no-deps stadata` + `pip install tqdm` to work around it.
2. Its `view_dynamictable()` convenience reshaper (meant to turn the raw JSON
   into a clean wide table) **crashes** under pandas 3.x — it tries to assign a
   `float` into an Arrow-backed string column and raises `TypeError`. `stadata`
   pins `pandas<3.0.0`; we have 3.0.3 installed.

`stadata`'s `Client.list_domain()` (region code lookup) works fine and was
used to build the domain table below. For everything else — variable search
and actual data pulls — this scraper calls the raw JSON endpoints directly
with `requests`, same approach as `pihps_scraper.py`.

## Files

- `raw/var{id}_th{a}-{b}_{timestamp}.json` — untouched `model=data` response
  for every request (5 year-pairs x 2 variables = 10 files).
- `bps_production_data.csv` — the Bagian A focus set: 8 kabupaten cross-
  referenced from the PIHPS work (Tier-1 + Tier-2 sentra, plus Kab. Bandung
  and Kab. Cianjur as non-sentra-in-PIHPS comparisons). Columns:
  `kabupaten, komoditas, tahun, produksi_ton, luas_panen_ha, produktivitas_ton_per_ha`.
- `bps_production_data_all_regencies.csv` — same columns, all 27 Jawa Barat
  kabupaten/kota (came back in the same requests at no extra cost, so kept).
- `bps_coverage_manifest.json` — one entry per (kabupaten, komoditas) x all 27
  regencies x 3 commodities. **Semantics differ from PIHPS's manifest** — see
  "Coverage manifest semantics" below before assuming they're comparable.

## Variable IDs (found via `model=var` keyword search, not guessed)

BPS's dynamic-table variable *titles* don't mention "cabai"/"bawang merah"
directly — searching those keywords at `domain=3200` returns nothing. The
commodity breakdown lives one level down, as a `turvar` (derived variable)
dimension inside a broader "Tanaman Sayuran" (vegetable crops) variable.
Found by searching broader keywords ("luas panen", "produksi", "sayuran"):

| var_id | title | unit | regency breakdown |
|---|---|---|---|
| **176** | Produksi Tanaman Sayuran Menurut Kabupaten/Kota | Kuintal | yes (all 27 + province) |
| **174** | Luas Panen Tanaman Sayuran Menurut Kabupaten/Kota | Hektar | yes (all 27 + province) |

### turvar identity — confirmed empirically, not from labels alone

var 176's own `turvar` list has two entries that could plausibly be the two
cabai types: `159 "Cabai"` and `169 "Cabe Besar"`. Which one is Rawit and
which is Besar/Keriting isn't stated anywhere in the metadata — resolved by
pulling both and checking which kabupaten ranks where against the sentra
already confirmed during PIHPS work:

- turvar **169 "Cabe Besar"** ranks **Garut > Bandung > Cianjur** in every
  single year 2015-2024 — this matches the known Cabai Besar sentra ranking
  exactly (Garut has been the stable #1 the entire decade, 757k -> ~1.06M
  kuintal). **169 = Cabai Besar/Keriting.**
- By elimination, turvar **159 "Cabai" = Cabai Rawit**.
- turvar **158 "Bawang Merah"** — unambiguous, label matches directly.

var 174 (Luas Panen) has a *narrower* turvar list (8 crop types vs var 176's
22) and only a single combined `390 "Cabai"` — no separate "Cabe Besar" entry
exists there at all (confirmed: checked var_id 175 and 177, both `null`/don't
exist; searched "Cabe" / "Cabai Besar" / "Cabai Rawit" keywords at domain
3200, zero matches).

### Known limitation: Luas Panen cannot be split by cabai type

**Produksi (var 176) is available split into Cabai Rawit vs Cabai
Besar/Keriting. Luas Panen (var 174) is only available as a single combined
"Cabai" figure covering both types together.** This means:

- `Bawang Merah` rows have real `produksi_ton`, `luas_panen_ha`, and a
  genuinely computed `produktivitas_ton_per_ha`.
- `Cabai Rawit` and `Cabai Besar/Keriting` rows have real `produksi_ton` but
  `luas_panen_ha` / `produktivitas_ton_per_ha` are `NaN` — **deliberately left
  null rather than fabricated** by attaching the combined figure to one type
  or splitting it proportionally by production share (either would be a
  made-up number, not a measurement).
- The combined figure is preserved as its own row,
  `komoditas = "Cabai (Gabungan Rawit+Besar)"`, with `luas_panen_ha` populated
  and `produksi_ton` left null (since produksi IS split and summing it back
  would just reintroduce the same conflation this row exists to avoid).

If per-type Luas Panen turns out to matter for the Layer 3 harvest-overlap
model, the fallback is a static BPS table found during earlier PIHPS-era web
research — "Produksi Tanaman Sayuran dan Buah-Buahan Semusim Menurut
Kabupaten/Kota dan Jenis Tanaman, Provinsi Jawa Barat" on jabar.bps.go.id —
which may have finer granularity as a downloadable static table
(`list_statictable`/`view_statictable` in `stadata`, not pulled here).

## Sentra ranking cross-check — Bagian A required check

The brief asked to validate 2014-vintage web-search rankings against fresh
BPS numbers. One held, one **shifted meaningfully**:

**Cabai Besar/Keriting** — ranking **unchanged**: Garut has been the
undisputed #1 producer among these 8 kabupaten every year 2015-2024 (757k
kuintal in 2015 growing to ~1.06M by 2024). Cianjur was #2 in 2015 but
**Kab. Bandung overtook it for the #2 spot by ~2020** (Bandung grew from 250k
in 2015 to 893k in 2024; Cianjur fluctuated 280k-620k with no clear trend).
This doesn't change the PIHPS Tier-1 conclusion (Garut is still solidly the
validated sentra) but the #2/#3 order behind it has flipped since the 2014
source.

**Bawang Merah — ranking is meaningfully different from the 2014 figures
used to justify Tier-1 status.** The 2014 web-search source had Cirebon #1
(~33%), Kab. Bandung #2 (~25%), Majalengka #3 (~23%), Garut #4 (~14%). Fresh
BPS data (2015-2024, not just a single year) shows:

| kabupaten | 2015 | 2020 | 2024 |
|---|---|---|---|
| **Kab. Bandung** | 372,590 | 609,361 | **876,326** |
| Kab. Cirebon | 317,818 | 346,360 | 320,944 |
| Kab. Majalengka | 324,082 | 351,668 | 319,782 |
| Kab. Garut | 220,385 | 273,346 | 370,822 |
(quintals; Kab. Sumedang, Cianjur, Tasikmalaya, Kota Sukabumi all far smaller, <20k)

**Kab. Bandung has been the largest bawang merah producer among these
kabupaten for essentially the entire decade** (not just 2024) and grew ~135%
over it, while Cirebon and Majalengka have been flat. This is a sustained
trend, not a one-year anomaly. **Practical implication: the PIHPS Tier-1
"Bawang Merah, sentra #1 covered" claim needs correcting** — Kab. Bandung
(now the real #1 producer, and has zero PIHPS Produsen responders for any
commodity checked) is not covered; PIHPS's Produsen coverage (Cirebon, Garut)
now corresponds to the **#2/#3** producers by 2024 volume, not #1. Coverage
of 2 of the top 4 producers is still meaningful for glut detection, but don't
present it as "the #1 sentra is covered" going forward.

## Coverage manifest semantics — different from PIHPS's manifest

PIHPS's `coverage_manifest.json` answers "does a price responder exist at
all in this kabupaten" (often "no" — most kabupaten have zero PIHPS
responders for a given commodity). BPS's census-style survey means **every**
kabupaten reports *some* number for *every* crop every year, even negligible
ones — e.g. Kota Sukabumi shows a "consistent" 10-year Bawang Merah series
that's <1 ton/year, not a real production base. Because of this, **all 81
entries in `bps_coverage_manifest.json` come back `"consistent"`** (>=5 of 10
years have a real value) — status alone doesn't tell you whether a kabupaten
is agriculturally significant for that crop. Use `latest_produksi_ton`
(included in every entry) to judge materiality, not `status`.

## Bagian B — sub-annual granularity: **TIDAK ADA** for hortikultura

Searched `model=var` at domain 3200 for "Bulan" (monthly), "Triwulan"
(quarterly), and "Subround" (BPS's own 4-month agricultural sub-period
concept):

| keyword | what matched | horticulture (cabai/bawang) present? |
|---|---|---|
| Bulan | inflation, expenditure surveys, jobseeker stats | no |
| Triwulan | PDRB (GRDP) quarterly growth indicators | no |
| Subround | Produktivitas Kedelai/Jagung/Kacang Tanah/Ubi Kayu/Ubi Jalar **per Kabupaten/Kota** | no — palawija (secondary staple crops) only |

**Answer: TIDAK ADA.** Sub-annual (monthly/quarterly/subround) breakdown
exists for rice (via a separate monthly KSA-style series, e.g. var 935/937/938
"...Kabupaten/Kota menurut Bulan") and for palawija crops (soybean, corn,
peanut, cassava, sweet potato — via the "Subround" variables), but **not for
Cabai or Bawang Merah** — BPS's horticulture survey (SPH-SBS) is annual only
at this domain. **BPS cannot serve as a KATAM fallback proxy for these two
commodities** — if KATAM access fails, there is no BPS sub-annual substitute
for cabai/bawang merah specifically.

## `datacontent` key format (for anyone extending this)

`model=data` responses return one flat dict, `datacontent`, keyed by simple
string concatenation — **not fixed-width padding**:

```
key = f"{vervar_val}{var_id}{turvar_val}{tahun_val}{turth_val}"
```

e.g. `vervar=3200, var=174, turvar=151, tahun=123, turth=0` -> key
`"32001741511230"`. Reconstructed from the response's own `vervar`/`tahun`/
`turtahun` lists (not assumed digit widths), since `var_id` length can differ
across variables. `turth` is always `0` ("Tidak Ada"/N/A) for annual data —
it exists for BPS's other periodicity types, not used here.

**`th` (period id) is capped at 2 years per request** — requesting more
raises `"The maximum allowed number of years for the 'th' parameter is 2"`.
`th_id` -> year mapping isn't sequential-by-offset across all variables; look
it up per variable via `model=th` (`bps_scraper.py` hardcodes `TH_PAIRS` for
174/176 since both confirmed to share the same 2015-2024/`th 115-124` range).

Units: var 176 (Produksi) is in **Kuintal** (1 kuintal = 100 kg); converted
to `produksi_ton` (÷10) in the output CSV. var 174 (Luas Panen) is already in
**Hektar**, no conversion needed.

## Politeness

BPS's webapi timed out under back-to-back requests during recon (more
fragile than PIHPS) — this scraper uses a 2s sleep between every request plus
retry-with-backoff on failure. The full pull is only 10 requests, so this
finishes in well under a minute regardless.
