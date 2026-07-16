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
const badPaths = Object.entries(geo.kabupaten).filter(([, v]) => !v.path.startsWith("M") || !v.path.trim().endsWith("Z"));
if (badPaths.length) {
  console.error("Path tidak valid untuk:", badPaths.map(([id]) => id));
  process.exit(1);
}
console.log(`OK — semua ${mapIds.length} kabupaten di map.json punya geometri asli yang valid.`);
