import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import polygonClipping from "polygon-clipping";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "..", "data", "curated", "region_aliases.csv");
const GEOJSON_PATH = path.join(__dirname, "source", "jabar-kabupaten-kota.geojson");
const INDO38_PATH = path.join(__dirname, "source", "indo-kabupaten-38prov.json");
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

// --- geometry helpers -------------------------------------------------

function perpendicularDistance(pt, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (len * len);
  const projX = a[0] + t * dx, projY = a[1] + t * dy;
  return Math.hypot(pt[0] - projX, pt[1] - projY);
}

// Douglas-Peucker: GADM rings carry thousands of points, way more detail
// than a ~800px-wide map needs. This keeps the shape while cutting the
// point count by roughly two orders of magnitude.
function simplifyRing(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0, index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = simplifyRing(points.slice(0, index + 1), epsilon);
    const right = simplifyRing(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

// Sutherland-Hodgman clip against a single half-plane: keeps points where
// dot(point - p0, normal) >= 0. Used to split the Ciamis polygon in two
// along the perpendicular bisector between the Ciamis/Pangandaran centroids
// (GADM predates Pangandaran's 2012 split from Ciamis, so there's no
// standalone Pangandaran polygon to use instead).
function clipByHalfPlane(ring, p0, normal) {
  const side = (pt) => (pt[0] - p0[0]) * normal[0] + (pt[1] - p0[1]) * normal[1];
  const intersect = (a, b) => {
    const fa = side(a), fb = side(b);
    const t = fa / (fa - fb);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const curr = ring[i];
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const currIn = side(curr) >= 0;
    const prevIn = side(prev) >= 0;
    if (currIn) {
      if (!prevIn) out.push(intersect(prev, curr));
      out.push(curr);
    } else if (prevIn) {
      out.push(intersect(prev, curr));
    }
  }
  return out;
}

function ringToPath(ring) {
  return ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ") + " Z";
}

function ringCentroid(ring) {
  const n = ring.length;
  const x = ring.reduce((s, p) => s + p[0], 0) / n;
  const y = ring.reduce((s, p) => s + p[1], 0) / n;
  return [x, y];
}

// --- load inputs --------------------------------------------------------

const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
const canonical = rows.map((r) => ({ id: r.id, nama_resmi: r.nama_resmi, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));

const geojson = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));

// Match each canonical kabupaten/kota to its GADM feature. GADM's NAME_2
// already carries a "Kota " prefix for the six kabupaten/kota name clashes
// (Bandung, Bogor, Cirebon, Sukabumi, Tasikmalaya — but NOT Bekasi, which
// GADM also prefixes) and no prefix at all for cities with no clash
// (Banjar, Cimahi, Depok). Stripping any "Kota " prefix from both sides
// before comparing, and separately checking TYPE_2, handles every case
// uniformly instead of hardcoding the six exceptions.
function matchFeature(namaResmi) {
  const isKota = namaResmi.startsWith("Kota ");
  const bareName = namaResmi.replace(/^(Kab\.|Kota)\s+/, "");
  const expectedType = isKota ? "Kota" : "Kabupaten";
  return geojson.features.find((f) => {
    const p = f.properties;
    const gadmBare = p.NAME_2.replace(/^Kota\s+/, "");
    return gadmBare === bareName && p.TYPE_2 === expectedType;
  });
}

// --- project every coordinate in every matched feature (lng/lat -> x/y) --

const latMean = canonical.reduce((s, c) => s + c.lat, 0) / canonical.length;
const cosLat = Math.cos((latMean * Math.PI) / 180);
const project = ([lng, lat]) => [lng * cosLat, -lat];

function featureRings(feature) {
  const g = feature.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  // Each polygon is [outerRing, ...holes]; keep only the outer ring — holes
  // (e.g. a lake) are a level of detail this map doesn't need.
  return polys.map((poly) => poly[0].map(project));
}

const matchedRingsById = {};
for (const c of canonical) {
  if (c.id === "ciamis" || c.id === "pangandaran") continue; // handled separately below
  const feature = matchFeature(c.nama_resmi);
  if (!feature) {
    throw new Error(`Tidak ketemu fitur GADM untuk ${c.nama_resmi} (id ${c.id})`);
  }
  matchedRingsById[c.id] = featureRings(feature);
}

// Ciamis / Pangandaran: GADM predates Pangandaran's 2012 split, so its
// "Ciamis" polygon covers both. Instead of a straight bisector cut (which
// rendered as an obviously artificial diagonal line), clip the detailed
// GADM polygon with the REAL Pangandaran boundary from the coarser
// post-2022 38-province dataset: intersection = Pangandaran, difference =
// Ciamis. The inland split now follows the true administrative border while
// the coastline keeps GADM detail.
const indo38 = JSON.parse(readFileSync(INDO38_PATH, "utf8"));
const pangandaranReal = indo38.features.find(
  (f) => f.properties.WADMPR === "Jawa Barat" && f.properties.WADMKK === "Pangandaran"
);
if (!pangandaranReal) throw new Error("Pangandaran tidak ketemu di dataset 38-provinsi");

const ciamisFeature = matchFeature("Kab. Ciamis");
if (!ciamisFeature) throw new Error("Tidak ketemu fitur GADM untuk Ciamis");

// polygon-clipping works in [ [ring], ... ] MultiPolygon form on raw
// (unprojected) lng/lat coordinates — project afterwards.
const ciamisRaw = (ciamisFeature.geometry.type === "Polygon"
  ? [ciamisFeature.geometry.coordinates]
  : ciamisFeature.geometry.coordinates
).map((poly) => [poly[0]]);
const pangandaranMask = (pangandaranReal.geometry.type === "Polygon"
  ? [pangandaranReal.geometry.coordinates]
  : pangandaranReal.geometry.coordinates
).map((poly) => [poly[0]]);

const pangandaranClipped = polygonClipping.intersection(ciamisRaw, pangandaranMask);
const ciamisClipped = polygonClipping.difference(ciamisRaw, pangandaranMask);
if (!pangandaranClipped.length || !ciamisClipped.length) {
  throw new Error("Clipping Ciamis/Pangandaran menghasilkan poligon kosong");
}
const toProjectedRings = (multi) => multi.map((poly) => poly[0].map(project));
matchedRingsById.ciamis = toProjectedRings(ciamisClipped);
matchedRingsById.pangandaran = toProjectedRings(pangandaranClipped);

// Waduk Cirata (a reservoir, not a regency) sits inside Purwakarta/Cianjur/
// Bandung Barat in this GADM cut — GADM carves it out as its own polygon,
// so excluding it entirely leaves a real hole in the mosaic. Kept as a
// separate non-clickable water shape instead of a kabupaten.
const waduqFeature = geojson.features.find((f) => f.properties.NAME_2 === "Waduk Cirata");
const waduqRings = waduqFeature ? featureRings(waduqFeature) : [];

// --- simplify, compute global bounds, scale to viewBox -------------------

const RAW_EPSILON = 0.002; // degrees-ish in projected space, pre-scale
const simplifiedById = {};
for (const [id, rings] of Object.entries(matchedRingsById)) {
  simplifiedById[id] = rings.map((r) => simplifyRing(r, RAW_EPSILON)).filter((r) => r.length >= 3);
}
const simplifiedWaduq = waduqRings.map((r) => simplifyRing(r, RAW_EPSILON)).filter((r) => r.length >= 3);

const allPoints = Object.values(simplifiedById).flat(2).concat(simplifiedWaduq.flat());
const xs = allPoints.map((p) => p[0]);
const ys = allPoints.map((p) => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);

const RAW_WIDTH = 800;
const scale = RAW_WIDTH / (maxX - minX);
const rawHeight = (maxY - minY) * scale;
const PAD = 20;
const width = RAW_WIDTH + PAD * 2;
const height = rawHeight + PAD * 2;

const toViewBox = ([x, y]) => [(x - minX) * scale + PAD, (y - minY) * scale + PAD];

const kabupaten = {};
for (const [id, rings] of Object.entries(simplifiedById)) {
  const scaledRings = rings.map((r) => r.map(toViewBox));
  const d = scaledRings.map(ringToPath).join(" ");
  const [labelX, labelY] = ringCentroid(scaledRings[0]);
  kabupaten[id] = { path: d, labelX: +labelX.toFixed(2), labelY: +labelY.toFixed(2) };
}

const water = simplifiedWaduq.length
  ? simplifiedWaduq.map((r) => r.map(toViewBox)).map(ringToPath).join(" ")
  : null;

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const output = { viewBox: `0 0 ${width.toFixed(0)} ${height.toFixed(0)}`, kabupaten, water };
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`Ditulis ${Object.keys(kabupaten).length} kabupaten + ${water ? "1" : "0"} badan air (geometri asli) ke ${OUT_PATH}`);
