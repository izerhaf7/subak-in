# Fondasi Web + F1 (Peta Risiko) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `web/` Vite+React app and ship a working F1 (Peta Risiko) screen — a clickable, color-coded map of 27 Jabar kabupaten with a commodity switcher and a per-kabupaten price forecast panel — reading only from the static JSON `web/public/data/` already produced by M1.

**Architecture:** Plain `useState`/props, no router or Context (see spec §"Keputusan arsitektur" — deferred until F3/F4 actually need shared state). Map geometry is a Voronoi diagram generated once from the 27 kabupaten centroids already in `data/curated/region_aliases.csv`, not sourced externally (see spec update — Voronoi chosen over external GeoJSON sourcing given the H-1/H-2 deadline).

**Tech Stack:** Vite + React (JSX, not TypeScript), Recharts, plain CSS with custom-property tokens, Vitest for pure-logic unit tests, `d3-delaunay` (build-time only, for the geo generator script — not shipped to the browser).

**Spec:** `docs/superpowers/specs/2026-07-16-foundation-f1-design.md`

## Global Constraints

- **Zero live network calls from the shipped app** — every fetch targets a local static file under `web/public/`. Before considering this plan done, `grep -r "api\.\|http" web/src/` must return nothing (see Task 10).
- **JSX, not TypeScript** — no `.ts`/`.tsx` files anywhere in `web/`.
- **No Leaflet/Mapbox/routing/state library** — inline SVG, plain `useState`, no `react-router`, no Context (this sub-project only — may change when F3 is planned).
- **Locked design tokens**: background `#eeece6`, accent `#8a3f28` — every other color in this plan (the risk ramp) is derived from the accent's hue and validated with the dataviz skill's `validate_palette.js` (already run — see Task 1).
- **Definition of done**: `cd web && npm run build && npm run preview` must work with the machine's wifi off.
- **Testing scope for this plan**: pure-logic modules (`riskColor.js`, `loadData.js`, the geo generator script) get real Vitest unit tests written test-first. Presentational components (`StatusBadge`, `JabarMap`, `KomoditasSwitcher`, `KabupatenPanel`, `PetaRisiko`) are verified by manually exercising them in the dev server (Task 10) — not React Testing Library — a deliberate scope cut given the hackathon deadline, not an oversight.
- **Git**: plain commit messages, no `Co-Authored-By` trailer (see [[feedback-no-ai-attribution]] memory) — this repo's owner wants no AI-collaborator attribution. Do not push anywhere.
- **Collaboration mode**: the repo owner is a first-time programmer. Tasks 2 and 5 are theirs to attempt first (pure function, then a tiny presentational component) before comparing against this plan's reference implementation — every other task is implemented directly, explained chunk-by-chunk, with the owner reviewing before moving on.

---

### Task 1: Scaffold Vite + React app, design tokens

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.js`
- Create: `web/index.html`
- Create: `web/src/main.jsx`
- Create: `web/src/App.jsx`
- Create: `web/src/styles/tokens.css`
- Create: `web/.gitignore`

**Interfaces:**
- Produces: an `App` component every later task's `main.jsx` continues to boot; `tokens.css` custom properties (`--bg`, `--aksen`, `--risk-low`, `--risk-mid`, `--risk-high`, `--risk-critical`) that Task 6/8 components reference in class-based styles.

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "panen-radar-web",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `web/vite.config.js`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 3: Write `web/index.html`**

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Panen Radar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Write `web/src/main.jsx`**

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: Write `web/src/styles/tokens.css`**

```css
:root {
  --bg: #eeece6;
  --aksen: #8a3f28;
  --ink-primary: #2a241f;
  --ink-secondary: #52514e;
  --risk-low: #cc9685;
  --risk-mid: #ad644e;
  --risk-high: #8a3f28;
  --risk-critical: #56200f;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

The four `--risk-*` steps are a single-hue ramp built from the locked accent
`#8a3f28`'s own OKLCH hue (37.7°) and validated with the dataviz skill's
`validate_palette.js --ordinal` against surface `#eeece6`: lightness monotone,
adjacent steps ≥0.06 L apart, light end clears 2:1 contrast, hue spread 1°.
All checks passed (`ALL CHECKS PASS`) — don't re-derive this, reuse it.

- [ ] **Step 6: Write placeholder `web/src/App.jsx`** (Task 9 replaces this with the real screen)

```jsx
import "./styles/tokens.css";

export default function App() {
  return <p>Panen Radar — fondasi siap.</p>;
}
```

- [ ] **Step 7: Write `web/.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 8: Install dependencies and verify the app boots**

Run: `cd web && npm install`
Expected: exits 0, creates `web/node_modules/`, no `npm error` lines.

Run: `npm run build && npm run preview`
Expected: build succeeds (`vite build` prints `✓ built in ...`), preview
serves on a local port; open it in a browser and confirm "Panen Radar —
fondasi siap." renders with the `#eeece6` background.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/vite.config.js web/index.html web/src/main.jsx web/src/App.jsx web/src/styles/tokens.css web/.gitignore
git commit -m "Scaffold Vite+React app with locked design tokens"
```

---

### Task 2: `riskColor.js` — pure function (developer's hands-on task)

**Files:**
- Create: `web/src/lib/riskColor.js`
- Test: `web/src/lib/riskColor.test.js`

**Interfaces:**
- Produces: `riskColor(skor: number) => string` (hex color) — consumed by `JabarMap.jsx` (Task 6).

**Note for this task specifically:** the repo owner is a first-time
programmer attempting this one themselves. Give them steps 1–2 (the test) and
the contract below, let them write step 3 themselves, then compare against
the reference implementation in step 3 before running step 4.

**Contract:** `skor` is a risk score 0–100. Map it to one of the four
validated ramp steps: `0–24 → "#cc9685"`, `25–49 → "#ad644e"`,
`50–74 → "#8a3f28"`, `75–100 → "#56200f"`. Out-of-range input is clamped
first (a `-10` behaves like `0`, a `150` behaves like `100`) rather than
throwing — the map should never crash on a stray value.

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/riskColor.test.js
import { describe, it, expect } from "vitest";
import { riskColor } from "./riskColor.js";

describe("riskColor", () => {
  it("returns the lightest band for low risk", () => {
    expect(riskColor(0)).toBe("#cc9685");
    expect(riskColor(24)).toBe("#cc9685");
  });

  it("returns the second band", () => {
    expect(riskColor(25)).toBe("#ad644e");
    expect(riskColor(49)).toBe("#ad644e");
  });

  it("returns the accent band", () => {
    expect(riskColor(50)).toBe("#8a3f28");
    expect(riskColor(74)).toBe("#8a3f28");
  });

  it("returns the darkest band for peak risk", () => {
    expect(riskColor(75)).toBe("#56200f");
    expect(riskColor(100)).toBe("#56200f");
  });

  it("clamps out-of-range scores instead of throwing", () => {
    expect(riskColor(-10)).toBe("#cc9685");
    expect(riskColor(150)).toBe("#56200f");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/riskColor.test.js`
Expected: FAIL — `riskColor.js` does not exist yet (`Cannot find module './riskColor.js'`).

- [ ] **Step 3: Write the implementation**

```js
// web/src/lib/riskColor.js
export function riskColor(skor) {
  const s = Math.max(0, Math.min(100, skor));
  if (s < 25) return "#cc9685";
  if (s < 50) return "#ad644e";
  if (s < 75) return "#8a3f28";
  return "#56200f";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/riskColor.test.js`
Expected: PASS, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/riskColor.js web/src/lib/riskColor.test.js
git commit -m "Add riskColor: risk score to validated color ramp"
```

---

### Task 3: `loadData.js` — data fetch helpers

**Files:**
- Create: `web/src/lib/loadData.js`
- Test: `web/src/lib/loadData.test.js`

**Interfaces:**
- Produces: `loadMeta()`, `loadMap(komoditasId)`, `loadKabupaten(kabupatenId, komoditasId)`, `loadGeo()` — all `async`, all resolve to parsed JSON or reject with a message-bearing `Error`. Consumed by `App.jsx` and `PetaRisiko.jsx` (Task 9).

- [ ] **Step 1: Write the failing tests**

```js
// web/src/lib/loadData.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadMeta, loadMap, loadKabupaten, loadGeo } from "./loadData.js";

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("loadMeta", () => {
  it("fetches meta.json and returns parsed JSON", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ minggu_berjalan: 29 }) });
    const result = await loadMeta();
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/meta.json");
    expect(result).toEqual({ minggu_berjalan: 29 });
  });

  it("throws a readable error when the response is not ok", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(loadMeta()).rejects.toThrow("Gagal memuat meta.json (status 404)");
  });
});

describe("loadMap", () => {
  it("uses map.json for cabai_rawit (the default, no suffix)", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ komoditas_id: "cabai_rawit" }) });
    await loadMap("cabai_rawit");
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/map.json");
  });

  it("uses map_<komoditas>.json for other komoditas", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ komoditas_id: "bawang_merah" }) });
    await loadMap("bawang_merah");
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/map_bawang_merah.json");
  });
});

describe("loadKabupaten", () => {
  it("uses the plain file for cabai_rawit", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: "bogor_kab" }) });
    await loadKabupaten("bogor_kab", "cabai_rawit");
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/kabupaten/bogor_kab.json");
  });

  it("uses the __komoditas suffix for other komoditas", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: "bogor_kab" }) });
    await loadKabupaten("bogor_kab", "bawang_merah");
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/kabupaten/bogor_kab__bawang_merah.json");
  });
});

describe("loadGeo", () => {
  it("fetches the generated geo file", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ viewBox: "0 0 1 1", kabupaten: {} }) });
    await loadGeo();
    expect(globalThis.fetch).toHaveBeenCalledWith("/geo/jabar_kabupaten.svg.json");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/loadData.test.js`
Expected: FAIL — `loadData.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

```js
// web/src/lib/loadData.js
const DATA_BASE = "/data";

async function fetchJson(url, notFoundLabel) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal memuat ${notFoundLabel} (status ${res.status})`);
  }
  return res.json();
}

export function loadMeta() {
  return fetchJson(`${DATA_BASE}/meta.json`, "meta.json");
}

export function loadMap(komoditasId) {
  const file = komoditasId === "cabai_rawit" ? "map.json" : `map_${komoditasId}.json`;
  return fetchJson(`${DATA_BASE}/${file}`, file);
}

export function loadKabupaten(kabupatenId, komoditasId) {
  const file = komoditasId === "cabai_rawit"
    ? `${kabupatenId}.json`
    : `${kabupatenId}__${komoditasId}.json`;
  return fetchJson(`${DATA_BASE}/kabupaten/${file}`, file);
}

export function loadGeo() {
  return fetchJson("/geo/jabar_kabupaten.svg.json", "geometri peta");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/loadData.test.js`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/loadData.js web/src/lib/loadData.test.js
git commit -m "Add loadData fetch helpers for meta/map/kabupaten/geo JSON"
```

---

### Task 4: Voronoi map geometry generator

**Files:**
- Create: `scripts/geo/package.json`
- Create: `scripts/geo/generate.mjs`
- Create: `scripts/geo/verify.mjs`
- Create (generated, not hand-written): `web/public/geo/jabar_kabupaten.svg.json`

**Interfaces:**
- Reads: `data/curated/region_aliases.csv` (columns `id,nama_resmi,nama_pendek,jenis,pihps_regency,bps_kabupaten,bmkg_kabupaten,bmkg_zom_code,is_sentra_bmkg,lat,lng` — 27 rows, already in the repo, produced by M1).
- Produces: `web/public/geo/jabar_kabupaten.svg.json` shaped `{ viewBox: string, kabupaten: { [id]: { path: string, labelX: number, labelY: number } } }` — consumed by `JabarMap.jsx` (Task 6) via `loadGeo()`.

This is a one-time, deterministic build script (not shipped to the browser,
not part of `web/`'s own `package.json`) — it exists so the geometry is
reproducible, not because it needs to run again during the demo.

- [ ] **Step 1: Write `scripts/geo/package.json`**

```json
{
  "name": "panen-radar-geo-gen",
  "private": true,
  "type": "module",
  "dependencies": {
    "d3-delaunay": "^6.0.4"
  }
}
```

- [ ] **Step 2: Install**

Run: `cd scripts/geo && npm install`
Expected: exits 0, creates `scripts/geo/node_modules/`.

- [ ] **Step 3: Write `scripts/geo/generate.mjs`**

```js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Delaunay } from "d3-delaunay";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "..", "data", "curated", "region_aliases.csv");
const OUT_PATH = path.join(__dirname, "..", "..", "web", "public", "geo", "jabar_kabupaten.svg.json");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((key, i) => { row[key] = cells[i]; });
    return row;
  });
}

const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
const points = rows.map((r) => ({ id: r.id, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));

// Equirectangular-ish projection: fine at province scale. Longitude is
// squeezed by cos(latitude) so east-west distances aren't stretched; y is
// flipped because SVG y grows downward while latitude grows northward.
const latMean = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
const cosLat = Math.cos((latMean * Math.PI) / 180);
const projected = points.map((p) => ({ id: p.id, x: p.lng * cosLat, y: -p.lat }));

const RAW_WIDTH = 800;
const xs = projected.map((p) => p.x);
const ys = projected.map((p) => p.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const scale = RAW_WIDTH / (maxX - minX);
const rawHeight = (maxY - minY) * scale;

const PAD = 40;
const scaled = projected.map((p) => ({
  id: p.id,
  x: (p.x - minX) * scale + PAD,
  y: (p.y - minY) * scale + PAD,
}));

const width = RAW_WIDTH + PAD * 2;
const height = rawHeight + PAD * 2;

const delaunay = Delaunay.from(scaled.map((p) => [p.x, p.y]));
const voronoi = delaunay.voronoi([-PAD, -PAD, width + PAD, height + PAD]);

const kabupaten = {};
scaled.forEach((p, i) => {
  const cell = voronoi.cellPolygon(i);
  if (!cell) {
    throw new Error(`Voronoi cell kosong untuk ${p.id} — cek titik duplikat di region_aliases.csv`);
  }
  const d = cell.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ") + " Z";
  kabupaten[p.id] = { path: d, labelX: +p.x.toFixed(2), labelY: +p.y.toFixed(2) };
});

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const output = { viewBox: `0 0 ${width.toFixed(0)} ${height.toFixed(0)}`, kabupaten };
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`Ditulis ${Object.keys(kabupaten).length} kabupaten ke ${OUT_PATH}`);
```

- [ ] **Step 4: Run the generator**

Run: `node generate.mjs` (from `scripts/geo/`)
Expected: `Ditulis 27 kabupaten ke .../web/public/geo/jabar_kabupaten.svg.json`

- [ ] **Step 5: Write `scripts/geo/verify.mjs`**

```js
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const geo = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "web", "public", "geo", "jabar_kabupaten.svg.json"), "utf8"));
const map = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "web", "public", "data", "map.json"), "utf8"));

const geoIds = new Set(Object.keys(geo.kabupaten));
const mapIds = map.kabupaten.map((k) => k.id);

const missing = mapIds.filter((id) => !geoIds.has(id));
if (missing.length) {
  console.error("Kabupaten tanpa geometri:", missing);
  process.exit(1);
}
if (geoIds.size !== 27) {
  console.error(`Diharapkan 27 kabupaten, ketemu ${geoIds.size}`);
  process.exit(1);
}
console.log(`OK — semua ${mapIds.length} kabupaten di map.json punya geometri.`);
```

- [ ] **Step 6: Run the verifier**

Run: `node verify.mjs` (from `scripts/geo/`)
Expected: `OK — semua 27 kabupaten di map.json punya geometri.` (exit 0)

- [ ] **Step 7: Commit**

```bash
git add scripts/geo/package.json scripts/geo/generate.mjs scripts/geo/verify.mjs web/public/geo/jabar_kabupaten.svg.json
git commit -m "Generate F1 map geometry as a Voronoi diagram from kabupaten centroids"
```

Note: `scripts/geo/node_modules/` stays untracked — add a `scripts/geo/.gitignore` with `node_modules/` in this step if `git status` shows it as untracked-and-about-to-be-added.

---

### Task 5: `StatusBadge` component (developer's second hands-on task)

**Files:**
- Create: `web/src/components/StatusBadge.jsx`

**Interfaces:**
- Produces: `<StatusBadge status="measured" | "measured_stale" | "modeled" />` — consumed by `KabupatenPanel.jsx` (Task 8).

**Note for this task:** the developer's second solo attempt. It's plain JSX
with no state and no data fetching — a lookup object and a `<span>`. Let them
try it from the contract below before showing the reference.

**Contract:** three known status values map to Indonesian labels:
`measured → "Terukur"`, `measured_stale → "Data berhenti"`,
`modeled → "Estimasi model"`. Anything else (defensively) falls back to the
`modeled` label rather than rendering blank or crashing.

- [ ] **Step 1: Write the component**

```jsx
// web/src/components/StatusBadge.jsx
const LABELS = {
  measured: { text: "Terukur", className: "status-badge status-badge--measured" },
  measured_stale: { text: "Data berhenti", className: "status-badge status-badge--stale" },
  modeled: { text: "Estimasi model", className: "status-badge status-badge--modeled" },
};

export default function StatusBadge({ status }) {
  const info = LABELS[status] ?? LABELS.modeled;
  return <span className={info.className}>{info.text}</span>;
}
```

- [ ] **Step 2: Manual check**

There's no automated test for this one (see Global Constraints — components
are manually verified). It gets exercised for real once `KabupatenPanel`
(Task 8) renders it; for now just confirm it has no syntax errors:

Run: `cd web && node --check src/components/StatusBadge.jsx 2>&1 || npx vite build --mode development 2>&1 | tail -20`
Expected: no error output (a `.jsx` file with a bare export doesn't parse
under plain `node --check` since it's JSX, not JS — if that command errors
on the JSX syntax itself rather than a real bug, skip it and just let
Task 9's build catch any real problem).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/StatusBadge.jsx
git commit -m "Add StatusBadge component for measured/stale/modeled status"
```

---

### Task 6: `JabarMap` component

**Files:**
- Create: `web/src/components/JabarMap.jsx`

**Interfaces:**
- Consumes: `riskColor(skor)` from `web/src/lib/riskColor.js` (Task 2); data shaped like `web/public/geo/jabar_kabupaten.svg.json` (Task 4) and `web/public/data/map.json` (existing M1 output).
- Produces: `<JabarMap geo={geoObject} mapData={mapObject} minggu={number} selectedId={string|null} onSelect={(id) => void} />` — consumed by `PetaRisiko.jsx` (Task 9).

- [ ] **Step 1: Write the component**

```jsx
// web/src/components/JabarMap.jsx
import { riskColor } from "../lib/riskColor.js";

export default function JabarMap({ geo, mapData, minggu, selectedId, onSelect }) {
  const skorById = Object.fromEntries(
    mapData.kabupaten.map((k) => {
      const entry = k.risk_mingguan.find((r) => r.minggu === minggu);
      return [k.id, entry ? entry.skor : 0];
    })
  );

  return (
    <svg
      viewBox={geo.viewBox}
      className="jabar-map"
      role="img"
      aria-label="Peta risiko panen raya Jawa Barat"
    >
      {Object.entries(geo.kabupaten).map(([id, shape]) => (
        <path
          key={id}
          d={shape.path}
          fill={riskColor(skorById[id] ?? 0)}
          stroke="#eeece6"
          strokeWidth={1.5}
          className={
            id === selectedId
              ? "jabar-map__region jabar-map__region--selected"
              : "jabar-map__region"
          }
          onClick={() => onSelect(id)}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Manual check (deferred to Task 9/10)**

`JabarMap` has no standalone entry point yet — it's exercised once wired
into `PetaRisiko` in Task 9. No action here beyond confirming the file was
saved correctly (re-read it if unsure).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/JabarMap.jsx
git commit -m "Add JabarMap component: clickable risk-colored kabupaten paths"
```

---

### Task 7: `KomoditasSwitcher` component

**Files:**
- Create: `web/src/components/KomoditasSwitcher.jsx`

**Interfaces:**
- Produces: `<KomoditasSwitcher activeId={string} onChange={(id) => void} />` — consumed by `PetaRisiko.jsx` (Task 9).

- [ ] **Step 1: Write the component**

```jsx
// web/src/components/KomoditasSwitcher.jsx
const KOMODITAS = [
  { id: "cabai_rawit", label: "Cabai Rawit" },
  { id: "bawang_merah", label: "Bawang Merah" },
  { id: "cabai_besar", label: "Cabai Besar" },
];

export default function KomoditasSwitcher({ activeId, onChange }) {
  return (
    <div className="komoditas-switcher" role="tablist">
      {KOMODITAS.map((k) => (
        <button
          key={k.id}
          type="button"
          role="tab"
          aria-selected={k.id === activeId}
          className={
            k.id === activeId
              ? "komoditas-switcher__tab komoditas-switcher__tab--active"
              : "komoditas-switcher__tab"
          }
          onClick={() => onChange(k.id)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/KomoditasSwitcher.jsx
git commit -m "Add KomoditasSwitcher component"
```

---

### Task 8: `KabupatenPanel` component

**Files:**
- Create: `web/src/components/KabupatenPanel.jsx`

**Interfaces:**
- Consumes: `StatusBadge` (Task 5); data shaped like `web/public/data/kabupaten/{id}[__komoditas].json` (existing M1 output — `harga.historis`, `harga.forecast` with `lo`/`hi`, optional `retail_overlay`).
- Produces: `<KabupatenPanel kabupaten={kabupatenObject} />` — consumed by `PetaRisiko.jsx` (Task 9).

- [ ] **Step 1: Write the component**

```jsx
// web/src/components/KabupatenPanel.jsx
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "./StatusBadge.jsx";

function buildChartData(kabupaten) {
  const historisEntries = kabupaten.harga.historis.slice(-26);
  const forecastEntries = kabupaten.harga.forecast;
  const retailMap = new Map((kabupaten.retail_overlay ?? []).map((r) => [r.minggu, r.rp]));

  const rows = historisEntries.map((h) => ({
    minggu: h.minggu,
    historis: h.rp,
    forecast: null,
    band: null,
    retail: retailMap.get(h.minggu) ?? null,
  }));

  for (const f of forecastEntries) {
    rows.push({
      minggu: f.minggu,
      historis: null,
      forecast: f.rp,
      band: [f.lo, f.hi],
      retail: retailMap.get(f.minggu) ?? null,
    });
  }

  return rows;
}

export default function KabupatenPanel({ kabupaten }) {
  const data = buildChartData(kabupaten);
  const hasRetail = Boolean(kabupaten.retail_overlay);

  return (
    <aside className="kabupaten-panel">
      <header className="kabupaten-panel__header">
        <h2>{kabupaten.nama}</h2>
        <StatusBadge status={kabupaten.status_data} />
      </header>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcd8cd" />
          <XAxis dataKey="minggu" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rp${Math.round(v / 1000)}rb`} />
          <Tooltip formatter={(value) => (Array.isArray(value) ? `Rp${value[0]}–${value[1]}` : `Rp${value}`)} />
          <Area dataKey="band" stroke="none" fill="#8a3f28" fillOpacity={0.15} />
          <Line dataKey="historis" stroke="#52514e" dot={false} strokeWidth={2} connectNulls />
          <Line dataKey="forecast" stroke="#8a3f28" dot={false} strokeWidth={2} strokeDasharray="4 3" connectNulls />
          {hasRetail && (
            <Line dataKey="retail" stroke="#ad644e" dot={false} strokeWidth={1} connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/KabupatenPanel.jsx
git commit -m "Add KabupatenPanel: forecast chart with uncertainty band"
```

---

### Task 9: `PetaRisiko` screen — wire everything together

**Files:**
- Create: `web/src/screens/PetaRisiko.jsx`
- Modify: `web/src/App.jsx` (replace the Task 1 placeholder)

**Interfaces:**
- Consumes: `loadGeo`, `loadMap`, `loadKabupaten` (Task 3); `KomoditasSwitcher` (Task 7); `JabarMap` (Task 6); `KabupatenPanel` (Task 8); `meta` object from `loadMeta()` (Task 3), read by `App.jsx`.

- [ ] **Step 1: Write `web/src/screens/PetaRisiko.jsx`**

```jsx
import { useEffect, useState } from "react";
import KomoditasSwitcher from "../components/KomoditasSwitcher.jsx";
import JabarMap from "../components/JabarMap.jsx";
import KabupatenPanel from "../components/KabupatenPanel.jsx";
import { loadGeo, loadMap, loadKabupaten } from "../lib/loadData.js";

export default function PetaRisiko({ meta }) {
  const [geo, setGeo] = useState(null);
  const [komoditasId, setKomoditasId] = useState("cabai_rawit");
  const [mapData, setMapData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [kabupatenDetail, setKabupatenDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGeo().then(setGeo).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setMapData(null);
    loadMap(komoditasId).then(setMapData).catch((e) => setError(e.message));
  }, [komoditasId]);

  useEffect(() => {
    if (!selectedId) return;
    setKabupatenDetail(null);
    loadKabupaten(selectedId, komoditasId).then(setKabupatenDetail).catch((e) => setError(e.message));
  }, [selectedId, komoditasId]);

  function handleKomoditasChange(id) {
    setKomoditasId(id);
    setSelectedId(null);
    setKabupatenDetail(null);
  }

  if (error) return <p className="app-error">Gagal memuat data: {error}</p>;
  if (!geo || !mapData) return <p className="app-loading">Memuat peta...</p>;

  return (
    <div className="peta-risiko">
      <KomoditasSwitcher activeId={komoditasId} onChange={handleKomoditasChange} />
      <div className="peta-risiko__body">
        <JabarMap
          geo={geo}
          mapData={mapData}
          minggu={meta.minggu_berjalan}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {kabupatenDetail && <KabupatenPanel kabupaten={kabupatenDetail} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `web/src/App.jsx`**

```jsx
import { useEffect, useState } from "react";
import PetaRisiko from "./screens/PetaRisiko.jsx";
import { loadMeta } from "./lib/loadData.js";
import "./styles/tokens.css";

export default function App() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMeta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="app-error">Gagal memuat data: {error}</p>;
  if (!meta) return <p className="app-loading">Memuat...</p>;

  return <PetaRisiko meta={meta} />;
}
```

- [ ] **Step 3: Manual verification in the browser**

Run: `cd web && npm run dev`
Expected: opens on a local port; the page loads the map (27 colored
regions), clicking a region shows `KabupatenPanel` with a chart on the
right, and the three `KomoditasSwitcher` tabs each reload the map with
different colors (bawang_merah/cabai_besar have far more all-zero/green
regions than cabai_rawit — expected, per the spec's coverage notes).

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/PetaRisiko.jsx web/src/App.jsx
git commit -m "Wire PetaRisiko screen: map, komoditas switcher, kabupaten panel"
```

---

### Task 10: Final QA pass

**Files:** none created — verification only.

- [ ] **Step 1: Golden rule grep check**

Run: `grep -rn "api\.\|http" web/src/`
Expected: no output (zero matches). If anything matches, it's a bug per the
team's golden rule — fix it before continuing, don't suppress the grep.

- [ ] **Step 2: Offline build+preview check**

Turn off wifi, then run: `cd web && npm run build && npm run preview`
Expected: both succeed with wifi off — confirms zero live dependency.

- [ ] **Step 3: Manual click-through checklist**

With `npm run preview` running, in a browser:
- [ ] All 27 regions render with a fill color (no blank/transparent shapes).
- [ ] Clicking `bandung_kab` while on the `bawang_merah` tab shows it
  colored per its `risk_mingguan` score (per spec §"Temuan penting", this
  kabupaten is a deliberate blind-spot for bawang merah and must render,
  not be hidden by render order).
- [ ] Switching komoditas tabs clears the previously selected kabupaten's
  panel (no stale chart from a different commodity lingering).
- [ ] `KabupatenPanel` chart shows a visible band (shaded area) around the
  forecast line for at least one kabupaten.

- [ ] **Step 4: Run the full test suite one more time**

Run: `cd web && npm run test`
Expected: all riskColor.js and loadData.js tests pass (11 tests total).

- [ ] **Step 5: Commit** (only if Step 1 required a fix; otherwise nothing to commit)

```bash
git add -A
git commit -m "Fix zero-live-call violations found in QA pass"
```
