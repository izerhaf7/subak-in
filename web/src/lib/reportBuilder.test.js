import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProvinsiReport, buildKabupatenReport } from "./reportBuilder.js";
import { KOTA_IDS } from "./wilayah.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "public", "data");
function readJson(...parts) {
  return JSON.parse(readFileSync(path.join(DATA_DIR, ...parts), "utf8"));
}

const meta = readJson("meta.json");
const mapData = readJson("map.json");
const simulasi = readJson("simulasi.json");

// Minimal translator: only resolves the 3 keys resolveKualitasCatatan can
// produce, enough to assert the right branch fired without depending on
// the real i18n copy (which is exercised separately by LaporanModal's own
// render tests in Task 9).
function fakeT(key, vars) {
  const templates = {
    proxy_caption: "proxy caption for {sumber}",
    blind_spot: "blind spot for {nama}",
    stale_note: "stale note",
  };
  const template = templates[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : template;
}

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

describe("buildKabupatenReport", () => {
  it("garut (measured sentra, active simulation): trend present, no quality caveat, simulasi section present", () => {
    const kabupatenDetail = readJson("kabupaten", "garut.json");
    const report = buildKabupatenReport({
      mapData, kabupatenDetail, kabupatenId: "garut", simulasi,
      geser: { garut: 4 }, meta, komoditasId: "cabai_rawit", minggu: meta.minggu_berjalan, t: fakeT,
    });

    expect(report.mode).toBe("kabupaten");
    expect(report.kabupaten).toEqual({ id: "garut", nama: "Kab. Garut", statusData: "measured" });
    expect(report.risiko.trend.length).toBeGreaterThan(0);
    expect(report.kualitasData.catatan).toBeNull();
    expect(report.simulasi).not.toBeNull();
    expect(report.simulasi.geserMinggu).toBe(4);
    expect(report.simulasi.chartData).toHaveLength(20);
  });

  it("bandung_kab (modeled sentra with proxy, no active shift): quality note is the proxy caption, simulasi section absent", () => {
    const kabupatenDetail = readJson("kabupaten", "bandung_kab.json");
    const report = buildKabupatenReport({
      mapData, kabupatenDetail, kabupatenId: "bandung_kab", simulasi,
      geser: { bandung_kab: 0 }, meta, komoditasId: "cabai_rawit", minggu: meta.minggu_berjalan, t: fakeT,
    });

    expect(report.kabupaten).toEqual({ id: "bandung_kab", nama: "Kab. Bandung", statusData: "modeled" });
    expect(report.kualitasData.catatan).toBe(`proxy caption for ${kabupatenDetail.proxy_eceran.sumber_nama}`);
    expect(report.simulasi).toBeNull();
  });

  it("karawang (modeled, not a sentra, no proxy): quality note is the blind-spot caption, simulasi always absent", () => {
    const kabupatenDetail = readJson("kabupaten", "karawang.json");
    const report = buildKabupatenReport({
      mapData, kabupatenDetail, kabupatenId: "karawang", simulasi,
      geser: {}, meta, komoditasId: "cabai_rawit", minggu: meta.minggu_berjalan, t: fakeT,
    });

    expect(report.kabupaten).toEqual({ id: "karawang", nama: "Kab. Karawang", statusData: "modeled" });
    expect(report.kualitasData.catatan).toBe("blind spot for Kab. Karawang");
    expect(report.simulasi).toBeNull();
  });

  it("falls back to a badge-only quality note (null catatan) when kabupatenDetail hasn't loaded yet", () => {
    const report = buildKabupatenReport({
      mapData, kabupatenDetail: null, kabupatenId: "karawang", simulasi,
      geser: {}, meta, komoditasId: "cabai_rawit", minggu: meta.minggu_berjalan, t: fakeT,
    });

    expect(report.kualitasData.statusData).toBe("modeled");
    expect(report.kualitasData.catatan).toBeNull();
  });

  it("shows the stale-data caveat for a measured_stale kabupaten with no remaining forecast (synthetic fixture: no real kabupaten in current data hits this exact combination)", () => {
    const syntheticMapData = {
      kabupaten: [{
        id: "x", nama: "Kab. X", status_data: "measured_stale",
        risk_mingguan: [{ minggu: meta.minggu_berjalan, skor: 10 }],
        kpi: { risk_puncak: 10, minggu_puncak: meta.minggu_berjalan, harga_proyeksi_puncak_rp: null },
      }],
    };
    const syntheticDetail = { harga: { historis: [{ minggu: "2020-W01", rp: 1000 }], forecast: [] } };
    const report = buildKabupatenReport({
      mapData: syntheticMapData, kabupatenDetail: syntheticDetail, kabupatenId: "x", simulasi,
      geser: {}, meta, komoditasId: "cabai_rawit", minggu: meta.minggu_berjalan, t: fakeT,
    });

    expect(report.kualitasData.catatan).toBe("stale note");
  });
});
