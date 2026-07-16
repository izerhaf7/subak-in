import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convolveSingleCohort, interpolateHarga, aggregateSupplyCurve } from "./supplyMath.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "public", "data");
const meta = JSON.parse(readFileSync(path.join(DATA_DIR, "meta.json"), "utf8"));
const simulasi = JSON.parse(readFileSync(path.join(DATA_DIR, "simulasi.json"), "utf8"));

describe("convolveSingleCohort", () => {
  it("reproduces simulasi.json's test_vector exactly (verifies the Python->JS port)", () => {
    const kernel = meta.komoditas.find((k) => k.id === "cabai_rawit").kernel_panen;
    const garut = simulasi.kabupaten.find((k) => k.id === "garut");
    const cohortHa = Object.entries(simulasi.test_vector.input_kohort.garut)
      .map(([mingguRelatif, ha]) => [Number(mingguRelatif), ha])
      .filter(([, ha]) => ha > 0);

    const result = convolveSingleCohort(
      cohortHa,
      kernel.bobot_mingguan,
      kernel.mulai_panen_hari,
      garut.produktivitas_ton_per_ha,
      simulasi.test_vector.expected_kurva_pasokan_ton.length
    ).map((v) => Math.round(v * 100) / 100);

    expect(result).toEqual(simulasi.test_vector.expected_kurva_pasokan_ton);
  });

  it("shifting a cohort later delays its harvest by the same number of weeks", () => {
    const kernel = [1]; // single-week kernel: harvest lands exactly at mulai_panen_minggu
    const base = convolveSingleCohort([[0, 100]], kernel, 7, 1, 5); // mulai_panen_minggu = 1
    const shifted = convolveSingleCohort([[2, 100]], kernel, 7, 1, 5);
    expect(base).toEqual([0, 100, 0, 0, 0]);
    expect(shifted).toEqual([0, 0, 0, 100, 0]);
  });

  it("drops harvest weeks that fall outside the requested window instead of throwing", () => {
    const kernel = [1];
    const result = convolveSingleCohort([[10, 100]], kernel, 7, 1, 5);
    expect(result).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("aggregateSupplyCurve", () => {
  const kernel = [1]; // single-week kernel keeps the arithmetic easy to hand-check

  it("sums curves from multiple kabupaten into one province-wide curve", () => {
    const kabupaten = [
      { id: "a", kohort_tanam: [{ minggu_relatif: 0, luas_ha: 10 }], produktivitas_ton_per_ha: 2 },
      { id: "b", kohort_tanam: [{ minggu_relatif: 0, luas_ha: 5 }], produktivitas_ton_per_ha: 4 },
    ];
    // mulai_panen_hari=0 -> mulai_panen_minggu=0, so week 0 harvests immediately
    const result = aggregateSupplyCurve(kabupaten, kernel, 0, {}, 3);
    expect(result).toEqual([10 * 2 + 5 * 4, 0, 0]);
  });

  it("shifting one kabupaten moves only its contribution, not the other's", () => {
    const kabupaten = [
      { id: "a", kohort_tanam: [{ minggu_relatif: 0, luas_ha: 10 }], produktivitas_ton_per_ha: 1 },
      { id: "b", kohort_tanam: [{ minggu_relatif: 0, luas_ha: 10 }], produktivitas_ton_per_ha: 1 },
    ];
    const result = aggregateSupplyCurve(kabupaten, kernel, 0, { a: 2 }, 4);
    expect(result).toEqual([10, 0, 10, 0]);
  });
});

describe("interpolateHarga", () => {
  const lookup = [
    { rasio: 1, harga_rp: 25000 },
    { rasio: 1.5, harga_rp: 12000 },
    { rasio: 2, harga_rp: 6000 },
  ];

  it("returns the exact table value at a known ratio", () => {
    expect(interpolateHarga(1, lookup)).toBe(25000);
    expect(interpolateHarga(1.5, lookup)).toBe(12000);
    expect(interpolateHarga(2, lookup)).toBe(6000);
  });

  it("linearly interpolates between two table points", () => {
    expect(interpolateHarga(1.25, lookup)).toBeCloseTo(18500, 5);
  });

  it("clamps to the table's edges instead of extrapolating", () => {
    expect(interpolateHarga(0.5, lookup)).toBe(25000);
    expect(interpolateHarga(3, lookup)).toBe(6000);
  });
});
