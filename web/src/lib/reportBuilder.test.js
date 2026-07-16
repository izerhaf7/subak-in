import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProvinsiReport } from "./reportBuilder.js";
import { KOTA_IDS } from "./wilayah.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "public", "data");
function readJson(...parts) {
  return JSON.parse(readFileSync(path.join(DATA_DIR, ...parts), "utf8"));
}

const meta = readJson("meta.json");
const mapData = readJson("map.json");

describe("buildProvinsiReport", () => {
  it("returns top 5 kabupaten by score, excluding kota, with the passed-through coverage note", () => {
    const report = buildProvinsiReport({
      mapData,
      meta,
      komoditasId: "cabai_rawit",
      minggu: meta.minggu_berjalan,
      coverageNote: "test coverage note",
    });

    expect(report.mode).toBe("provinsi");
    expect(report.provinsi).toBe("Jawa Barat");
    expect(report.komoditas).toEqual({ id: "cabai_rawit", nama: "Cabai Rawit" });
    expect(report.mingguKonteks).toEqual({ berjalan: meta.minggu_berjalan, dilihat: meta.minggu_berjalan, isoLabel: meta.label_minggu[0] });
    expect(report.topRanking).toHaveLength(5);
    expect(report.coverage).toEqual({ measuredCount: expect.any(Number), total: 27, catatan: "test coverage note" });

    for (const row of report.topRanking) {
      expect(KOTA_IDS.has(row.id)).toBe(false);
    }
    const scores = report.topRanking.map((r) => r.skor);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
