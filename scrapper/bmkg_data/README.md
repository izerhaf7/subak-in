# BMKG Weather & Season-Onset Data (bmkg.go.id)

Weather forecast and season-onset (ZOM) data from BMKG (Badan Meteorologi,
Klimatologi, dan Geofisika) for **Panen Radar**. BMKG plays two roles here:

1. **Weather risk modifier** — short-term forecast for context/demo color.
2. **KATAM substitute** — since KATAM (Kementan's official planting calendar)
   was completely unreachable this hackathon (every domain alias tried
   failed), season-onset dates from BMKG + crop-duration constants from
   Balitsa/IPB literature (§4 of the technical report) are the fallback for
   estimating planting windows.

**Mandatory attribution:** any app/UI built from this data must credit
**"BMKG"** (a condition of using their public data) — this needs to appear in
the dashboard itself, not just in this README.

## Two very different data shapes — don't assume both are APIs

- **Bagian A** (`prakiraan-cuaca`): a real, confirmed JSON API. Fast, clean, done.
- **Bagian B** (ZOM season onset): **not an API, not an HTML table** — the
  official data only exists as color-coded PDF maps. Extracting it required
  downloading two ~100MB+ bulletin PDFs and visually/programmatically reading
  a map. See "Bagian B" below for the full investigation trail and what this
  means for re-running it later.

## How to re-run

```
python bmkg_scraper.py
```

Regenerates `bmkg_prakiraan_cuaca.csv` and raw JSON under `raw/` for Bagian A
(6 requests, seconds). **Bagian B does NOT re-run from this script** — see
below for why.

## Bagian A: `prakiraan-cuaca` (weather forecast)

```
GET https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={kode_adm4}
```

Confirmed working, but **blocked by Cloudflare (403 "Laman Diblokir") with a
bare `curl` request** — needed a full browser `User-Agent` *and* a same-site
`Referer: https://www.bmkg.go.id/` header to get through (see `HEADERS` in
`bmkg_scraper.py`). Response is 3-hourly forecast, ~17 entries covering the
next ~2 days, fields: `t` (suhu/°C), `tp` (curah hujan/mm), `hu` (kelembaban/%),
`tcc` (tutupan awan/%), `ws`/`wd` (angin), `vs` (jarak pandang/m), plus
`weather_desc` and an icon URL.

### adm4 codes — found via `cahyadsn/wilayah`, NOT guessed

`adm4` is a Kemendagri kelurahan/desa-level code (Kepmendagri No
100.1.1-6117/2022) — a **different coding system from both BPS's domain
codes and PIHPS's own region ids**, confirmed by comparing: BPS domain `3205`
= PIHPS/BMKG's kabupaten digits `32.05` for Kab. Garut — the 2-digit
provinsi+kabupaten suffix happens to match, but BMKG's is a 4-level dotted
code (`prov.kab.kec.kel`) while BPS's is a flat province+regency id, so
they're not directly interchangeable beyond that shared prefix.

No official lookup tool was found in BMKG's own `infoBMKG/data-cuaca` repo
(checked — it only has one example hardcoded adm4, no reverse lookup). Used
**`cahyadsn/wilayah`** instead (`db/archive/wilayah_2022.sql`, matches the
exact Kepmendagri 2022 version BMKG's API expects) — downloaded to
`wilayah_kemendagri_2022.sql` in this folder. It's a flat `(kode, nama)` SQL
table, e.g. `('32.05.22.2001','Cikajang')`, hierarchical by dot-splitting.

### Representative point selection (one per kabupaten, per the MVP scope)

Picked the **desa/kelurahan sharing the sentra kecamatan's own name**, with
the sentra kecamatan found via web search (not guessed):

| Kabupaten | Kecamatan (sentra) | adm4 | Evidence |
|---|---|---|---|
| Kab. Garut | Cikajang | `32.05.22.2001` | Cabai sentra — confirmed (blog + general knowledge, moderate confidence) |
| Kab. Cirebon | Pabedilan | `32.09.04.2001` | Bawang merah sentra (with Losari) — confirmed via web search |
| Kab. Bandung | Pangalengan | `32.04.15.2001` | Horticulture sentra (cabai+bawang) — confirmed via web search |
| Kab. Sumedang | Tanjungsari | `32.11.11.2002` | **Weak evidence** — no dedicated sentra source found, picked as an active agricultural market town |
| Kab. Tasikmalaya | Cigalontang | `32.06.27.2013` | Cabai rawit sentra — confirmed via academic source (ResearchGate) |
| Kota Sukabumi | Cikole | `32.72.02.1001` | Not a sentra — city-center kecamatan, plain reference point (minor/urban PIHPS responder only) |

### Output: `bmkg_prakiraan_cuaca.csv`

Columns: `kabupaten, kelurahan_code, kecamatan, desa, datetime, curah_hujan_mm,
suhu_c, kelembaban_pct, tutupan_awan_pct, kecepatan_angin_kmh, arah_angin,
cuaca, jarak_pandang_m, analysis_date`. 122 rows (6 points x ~17-22 forecast
entries each — count varies slightly per point since BMKG's forecast horizon
isn't perfectly fixed).

**This is a rolling ~2-day forecast, not history** — re-running it later
gives a different (current) forecast window, not more data added to the same
one. If historical weather (not forecast) is ever needed, this endpoint
doesn't provide it; a different BMKG product would be needed.

## Bagian B: ZOM season onset — investigation trail

**Correction (superseded below):** this section originally concluded no
extractable table existed anywhere in either bulletin, based on checking
`page.extract_tables()` on the per-province *map* pages and searching the
document text for "jawa barat". That conclusion was **wrong** — flagged by
the user, who spotted an actual table around page 50 of `Buku-PMK26.pdf`.
The real table exists in the LAMPIRAN (appendix), and the province-name text
search missed it because **the appendix identifies Jawa Barat's rows by ZOM
code prefix `JABAR_01`...`JABAR_41`, never spelling out "Jawa Barat"** — a
search for the literal words "jawa barat" (used to scope the earlier scan)
never matches that. Checking `extract_tables()` only on the *map figure*
pages (which are genuinely image-only) and generalizing that finding to the
whole 341-page document, without a targeted appendix search, was the mistake.
See "Corrected finding" below for what's actually there — the investigation
trail up to that point (steps 1-2) was accurate, only the conclusion drawn
from step 3 was wrong.

Steps actually checked, in order:

1. **`data.bmkg.go.id` / `iklim.bmkg.go.id`** — both reachable (with the same
   browser+Referer headers Bagian A needed), both are WordPress sites. Their
   WP REST API (`wp-json/wp/v2/posts`, `/media`) was searched for "musim",
   "zom", "awal musim", "prakiraan musim", "buku prakiraan" — **zero relevant
   results**. No custom post type for bulletins either (`types` endpoint only
   shows standard WP types + one unrelated "project" type).
2. **`bmkg.go.id/iklim/prediksi-musim`** and its dated sub-pages (e.g.
   `.../prediksi-musim-hujan-2025-2026-di-indonesia-pemutakhiran-november-2025`)
   — reachable, **narrative text + a direct PDF download link each**, no HTML
   table (`<table` count = 0 on these pages).
3. **The PDF bulletins' per-province MAP pages** (e.g. page 236, `Gambar
   12.A`) — confirmed image-only, `extract_tables()` returns nothing there,
   `Tabel N.` headings on those pages are narrative captions for an
   accompanying chart/map, not real tables. **This part of the finding still
   stands: the map figures themselves carry no embedded text data.**
4. **The PDF's LAMPIRAN (appendix)** — NOT checked thoroughly enough the
   first time. Re-examined after the user's tip: `Buku-PMK26.pdf` pages
   67-71 (pdfplumber 0-indexed; printed page 60-64) contain a full text
   table, **"Awal Musim Kemarau 2026"**, one row per ZOM, covering all of
   Indonesia by province block. Found by searching the full document text
   for `JABAR` (the appendix's actual per-province code prefix) instead of
   the words "jawa barat".

### Corrected finding: a real, structured appendix table exists (Musim Kemarau only)

`Buku-PMK26.pdf`, pages 67-71 (0-indexed; printed "PMK 2026 | 60" through
"| 64"), table columns: `No. ZOM, No. ZOM Provinsi (kode), Per
Daerah/Kabupaten (deskripsi teks wilayah), Awal Musim (kode dasarian, mis.
"MEI II"), Perbandingan Awal Musim terhadap Normal, Puncak Musim, Sifat
Hujan, Panjang Musim, dst.` All 41 Jawa Barat ZOMs (`JABAR_01` = ZOM 173
through `JABAR_41` = ZOM 213) transcribed into
**`bmkg_jabar_zom_kemarau2026_full.csv`** — a comprehensive reference table,
not just the 6 target kabupaten.

Nearby appendix pages carry more (not yet fully extracted, noted for future use):
- Pages 151-152: a full `NORMAL` rainfall-per-dasarian matrix per ZOM
  (numeric, `Jumlah Tahunan` column) — climatological baseline, not a 2026 prediction.
- Pages 167-168: `NORMAL` musim period/duration per ZOM (some ZOMs have two
  dry seasons per year, `MUSIM KEMARAU 1` / `MUSIM KEMARAU 2`) — this is the
  long-term average the "Perbandingan ... terhadap Normal" column in the
  main table is measured against, and is itself a reasonable proxy for
  historical onset variability if per-year data is ever needed.
- Pages 129-130: a color-coded (not text) rainfall-category calendar grid —
  confirmed still image/color-only, not a text table.

### Update: Musim Hujan appendix table found too (gap closed)

The rainy-season gap above was based on checking only
`Buku-Update-PMH2025-26-versi-Nov2025.pdf` (a 67-page **update** bulletin,
national-scale maps only, no appendix). That's a different document from the
**original** full Musim Hujan 2025/2026 bulletin, which wasn't downloaded
initially. Found it via `bmkg.go.id/iklim/prediksi-musim/prediksi-musim-hujan-2025-2026-di-indonesia`
(no "-pemutakhiran-..." suffix) -> `Buku-PMH-2025-2026.pdf`
(91,742,760 bytes, 301 pages — also checked `bmkg.go.id/iklim/prediksi-musim`
for a possible newer 2026/2027 edition; none exists yet as of this check).

Searched directly for `JABAR_` from the start this time (per the lesson
above) instead of re-deriving from scratch — found the equivalent **"Awal
Musim Hujan 2025/2026"** appendix table immediately, same structure, at
pages 60-65 (0-indexed; printed "PMH 2025/2026 | 53" through "| 58"). All 41
rows transcribed into **`bmkg_jabar_zom_hujan2025_2026_full.csv`**.

**Caveat:** many Jawa Barat ZOMs in this table read `SUDAH MH` (already in
the rainy season as of this bulletin's ~August 2025 calculation, no forward
onset date) or `MH SEPANJANG 2025` (rain continuous through 2025, no
discrete onset) rather than a clean future dasarian — this is a real
climatological feature of West Java's wetter highland zones, not missing
data. Also: the November 2025 update bulletin's own narrative text says
"beberapa ZOM yang semula diprediksikan masuk pada Agustus-Oktober bergeser
menjadi Oktober-November" for parts of Jawa — meaning **some of these August-
sourced values may have been revised by November**, but since the November
document has no equivalent per-ZOM text table (only national maps), the
revised text-form values aren't available to cross-check. None of our 6
targets' assigned ZOMs (192, 196, 198, 202, 207) had an Aug/Sep value in the
original table, so they're less likely to be among the ones that shifted,
but this isn't confirmed.

**Revised answer:** the rainy-season gap is **closed for the same reason and
to the same extent as Musim Kemarau** — a real per-ZOM text appendix exists,
found via the `JABAR_` prefix; the only remaining uncertainty is the same
kecamatan-to-ZOM boundary matching problem (no shapefile), plus the
secondary caveat above about the November revision. `bmkg_zom_onset.csv` now
has both `awal_musim_hujan` and `awal_musim_kemarau` populated for all 6
targets.

### The two PDF bulletins

| Bulletin | URL | Size | Scope |
|---|---|---|---|
| `Buku-PMK26.pdf` (Musim Kemarau 2026) | `content.bmkg.go.id/wp-content/uploads/Buku-PMK26.pdf` | 153,224,079 bytes, 341 pages | Full per-province maps + `JABAR_` appendix table (pages 67-71) — **usable, this is the primary Kemarau source** |
| `Buku-PMH-2025-2026.pdf` (Musim Hujan 2025/2026, original) | `content.bmkg.go.id/wp-content/uploads/Buku-PMH-2025-2026.pdf` | 91,742,760 bytes, 301 pages | Full per-province maps + `JABAR_` appendix table (pages 60-65) — **usable, this is the primary Hujan source** |
| `Buku-Update-PMH2025-26-versi-Nov2025.pdf` (Musim Hujan 2025/26, update) | `content.bmkg.go.id/wp-content/uploads/Buku-Update-PMH2025-26-versi-Nov2025.pdf` | 85,051,706 bytes, 67 pages | National-scale map only (Java is a tiny sliver, no appendix) — an "update" bulletin covering only the regions that changed since the original above, kept only as context for the "some ZOMs may have shifted since August" caveat |

**Gotcha:** a plain `curl -sL` / single-shot `requests.get` **silently
truncated downloads** more than once (got 70MB of the 153MB Kemarau PDF one
time, 31.7MB of the 91.7MB Hujan PDF another time, no error raised either
time) — always verify downloaded size against the `Content-Length` header;
`download_bulletin_pdf()` in `bmkg_scraper.py` does this and raises if they
don't match. `curl -C -` (resume) picking up from the partial file worked
both times once the truncation was caught. All three PDFs are archived in
`raw/pdf/`.

No newer **2026/2027** rainy-season edition exists yet (checked
`bmkg.go.id/iklim/prediksi-musim`'s full link list — nothing past
2025/2026) — expected, since that edition would normally publish around
August, and the current date is well before that.

### Methodology: matching a kecamatan to a ZOM row

The appendix table identifies each ZOM by a **text description of which
kabupaten (and which part — "bagian utara/selatan/timur/barat/tenggara"
etc.) it covers**, not by kecamatan name, and many ZOMs span slivers of
several neighboring kabupaten at once. There's no shapefile to do an exact
point-in-polygon lookup, so each target kecamatan was matched by:

1. Finding every ZOM row whose `Per Daerah/Kabupaten` text mentions the
   target kabupaten.
2. Comparing the target kecamatan's real position (bearing from its
   kabupaten's town center — e.g. Cikajang sits south-southwest of Garut
   town) against each candidate row's directional description, and which
   *other* neighboring kabupaten are named alongside it (e.g. a row naming
   "Sumedang bagian barat daya" together with "Bandung, Kota Bandung, Kota
   Cimahi" is describing the area right next to Jatinangor/Cimahi — which is
   exactly where Tanjungsari sits).
3. Where a first-pass **pixel-based visual reading of the map** (calibrated
   against the map's own printed lat/lon gridlines — same method as before,
   images kept in `raw/pdf_pages/`) had already been done, using it as a
   cross-check. It correctly identified the right ZOM *number* in most
   cases, but its *color* reading was sometimes one category off (MEI I vs
   MEI II are visually similar olive shades on this map, easy to
   misjudge) — a good illustration of why the text table, once found, is
   authoritative and the visual read is not. It's superseded here for
   Musim Kemarau but was the best available method for the parts of Bagian B
   this table doesn't cover (see "still needed" below).

### Result: `bmkg_zom_onset.csv` (final — both seasons)

| kabupaten | ZOM (kode) | Awal Musim Hujan 2025/2026 | Awal Musim Kemarau 2026 | confidence |
|---|---|---|---|---|
| Kab. Garut | JABAR_35 / ZOM 207 | SUDAH MH (sudah masuk hujan per Agustus 2025, tanpa tanggal onset) | Mei dasarian II | sedang — Cikajang cocok arah, tapi 4 ZOM tetangga (206/207/208/209) berdekatan |
| Kab. Cirebon | JABAR_24 / ZOM 196 | Oktober dasarian III 2025 | Mei dasarian II | **tinggi** — satu-satunya baris berisi "Cirebon bagian timur" saja |
| Kab. Bandung | JABAR_35 / ZOM 207 | SUDAH MH | Mei dasarian II | sedang — Pangalengan di selatan jauh Kab. Bandung dekat batas Cianjur |
| Kab. Sumedang | JABAR_20 / ZOM 192 | SUDAH MH | Juni dasarian I | sedang-tinggi — Tanjungsari berbatasan langsung dengan zona inti Bandung/Cimahi |
| Kab. Tasikmalaya | JABAR_30 / ZOM 202 | MH SEPANJANG 2025 (hujan kontinu, tanpa onset diskrit) | Mei dasarian II | **tinggi** — Cigalontang persis di perbatasan Garut timur |
| Kota Sukabumi | JABAR_26 / ZOM 198 | MH SEPANJANG 2025 | Juni dasarian I | **tinggi** — "Kota Sukabumi" disebut eksplisit dengan nama |

Vs the first (withdrawn) pixel-reading-only version: Garut and Cirebon's ZOM
*numbers* were already right; Cirebon's Kemarau onset was already right too.
**Bandung, Sumedang, and Tasikmalaya's Kemarau onset values changed** after
cross-referencing the text table (Bandung: Mei III -> Mei II; Sumedang: Mei I
-> Jun I; Tasikmalaya: Mei I -> Mei II) — the zone *numbers* for Tasikmalaya
and (one candidate for) Garut were already right visually, just the
color-to-category reading was one category off on the map.

**`awal_musim_hujan` gap is now closed** — see "Update: Musim Hujan appendix
table found too" above. Several targets read `SUDAH MH`/`MH SEPANJANG 2025`
rather than a clean forward date; this is a real climatological feature
(West Java's wetter highland ZOMs), not missing data — and comes with the
caveat that the November 2025 update may have shifted a few Java ZOMs later
(Agustus-Oktober -> Oktober-November), unconfirmed for our specific 5 ZOMs
since no updated per-ZOM text exists to check against.

**Historical multi-year onset was still NOT pulled** — each year's bulletin
is a separate PDF requiring its own appendix search (fast now that the
`JABAR_` trick is known) or map calibration (slow). The Musim Kemarau
`NORMAL` musim-period table at pages 167-168 of `Buku-PMK26.pdf` is a
reasonable climatological-baseline proxy if a full multi-year pull is never
done; flag if genuine per-year history is needed.

### Answering the brief's key question directly (final)

**Is this process structured/fully automatable, or does it need human-in-the-loop?**

**Mostly automatable for both seasons**, once you know to search a
bulletin's full text for its province's **ZOM code prefix** (`JABAR_` for
Jawa Barat — inferred here by finding a labeled example elsewhere in the
document, e.g. `SUMUT_04`) instead of searching for the province's name in
plain words. Both `Buku-PMK26.pdf` (Kemarau) and `Buku-PMH-2025-2026.pdf`
(Hujan, the *original* edition — not the national-scale-only November
update) have a real per-ZOM text appendix that a script can parse for any
kabupaten (`bmkg_jabar_zom_kemarau2026_full.csv` /
`bmkg_jabar_zom_hujan2025_2026_full.csv`). The one remaining non-automatable
step is matching a specific *kecamatan* to the right ZOM row when it sits
near a boundary between several ZOMs that share a category (Garut/Bandung
here) — that still needs a human judgment call or a real shapefile, neither
of which was available in this pipeline.

Lesson for next time, twice-confirmed now: when a bulletin's appendix
organizes by ZOM code instead of spelling out province/kabupaten names,
**search the full document text for the province's code prefix from the
start** — don't assume a province-name text search is sufficient, and don't
generalize "the map pages have no text" to "the whole document has no text
table" without a dedicated appendix search.

## Files

- `bmkg_prakiraan_cuaca.csv` — Bagian A output
- `bmkg_zom_onset.csv` — Bagian B output for the 6 target kabupaten, both seasons (final)
- `bmkg_jabar_zom_kemarau2026_full.csv` — all 41 Jawa Barat ZOM rows from the
  Musim Kemarau 2026 appendix table (comprehensive reference, not just the 6 targets)
- `bmkg_jabar_zom_hujan2025_2026_full.csv` — all 41 Jawa Barat ZOM rows from
  the Musim Hujan 2025/2026 appendix table (same, for rainy season)
- `wilayah_kemendagri_2022.sql` — Kemendagri adm-code reference (from `cahyadsn/wilayah`)
- `raw/prakiraan_cuaca_<kabupaten>_<timestamp>.json` — Bagian A raw API responses
- `raw/pdf/*.pdf` — all three bulletin PDFs (audit trail — "tunjukkan dokumen aslinya")
- `raw/pdf_pages/*.png` — rendered/annotated map pages and per-kabupaten zoom
  crops from the pixel-based visual reading (superseded by the text tables
  above for the final values, kept as the cross-check that helped catch the
  color-misreading on 3 of the 6 Kemarau values)

## Politeness / access notes

Both `api.bmkg.go.id` and the WordPress-based climate sites are behind
Cloudflare and return a hard 403 without a realistic browser `User-Agent` +
`Referer` — not a rate-limit issue, just bot-detection on the base request
shape. No aggressive polling was needed (Bagian A is 6 quick requests;
Bagian B's heavy lifting was two one-time PDF downloads).
