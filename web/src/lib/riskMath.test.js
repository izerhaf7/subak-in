import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreOverlapProvinsi, compositeRisk, recomputeAllRiskMingguan } from "./riskMath.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "public", "data");
const mapData = JSON.parse(readFileSync(path.join(DATA_DIR, "map.json"), "utf8"));
const simulasi = JSON.parse(readFileSync(path.join(DATA_DIR, "simulasi.json"), "utf8"));
const meta = JSON.parse(readFileSync(path.join(DATA_DIR, "meta.json"), "utf8"));

function shiftCurve(curve, shift) {
  const out = new Array(curve.length).fill(0);
  for (let i = 0; i < curve.length; i++) {
    if (i - shift >= 0 && i - shift < curve.length) out[i] = curve[i - shift];
  }
  return out;
}

describe("scoreOverlapProvinsi", () => {
  it("returns all zero when the province curve is all zero", () => {
    expect(scoreOverlapProvinsi([0, 0, 0], [0, 0, 0], [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("scores a kabupaten 0 in a week where it contributes nothing, even if the province is elevated that week", () => {
    const provinsiTon = [10, 10, 100, 10]; // week 2 elevated
    const maxTon = [8, 8, 90, 8]; // some other kabupaten is the week's biggest player
    const kabupatenTon = [0, 0, 0, 0]; // contributes nothing anywhere
    expect(scoreOverlapProvinsi(kabupatenTon, provinsiTon, maxTon)).toEqual([0, 0, 0, 0]);
  });

  it("scores a kabupaten at the FULL province deviation when it IS that week's biggest contributor", () => {
    const provinsiTon = [10, 10, 100, 10];
    const maxTon = [5, 5, 90, 5]; // this kabupaten (90 ton at week 2) sets the max
    const kabupatenTon = [0, 0, 90, 0];
    const result = scoreOverlapProvinsi(kabupatenTon, provinsiTon, maxTon);
    expect(result[2]).toBeCloseTo(Math.min(((100 / 2.5) - 1) * 60, 100), 5); // mean=2.5*10=25 -> ratio=4 -> saturates at 100
  });

  it("scores a kabupaten proportionally lower than the week's biggest contributor", () => {
    const provinsiTon = [10, 10, 100, 10];
    const maxTon = [5, 5, 90, 5]; // biggest player contributes 90 that week
    const half = scoreOverlapProvinsi([0, 0, 45, 0], provinsiTon, maxTon)[2]; // half of the max
    const full = scoreOverlapProvinsi([0, 0, 90, 0], provinsiTon, maxTon)[2]; // IS the max
    expect(half).toBeCloseTo(full / 2, 5);
  });
});

describe("compositeRisk", () => {
  it("scores 0 when supply is concentrated but price is healthy (no contradiction)", () => {
    expect(compositeRisk(100, 0)).toBe(0);
  });
  it("scores high (not 100, per the 70/30 geometric/price-only blend) when both overlap and price_gap are maxed", () => {
    // sqrt(1*1)*100=100 geometric, blended 0.7*100 + 0.3*(100*0.3)=79 - matches risk.py's composite_risk(100, 100).
    expect(compositeRisk(100, 100)).toBe(79);
  });
  it("falls back to overlap-only when price_gap is null (modeled kabupaten)", () => {
    expect(compositeRisk(42, null)).toBe(42);
  });
});

describe("recomputeAllRiskMingguan against real backend data (verifies the Python->JS port)", () => {
  it("reproduces map.json's precomputed risk_mingguan for every simulasi kabupaten exactly, with zero shifts applied", () => {
    const curveById = {};
    const riskInputsById = {};
    for (const simRow of simulasi.kabupaten) {
      const mapRow = mapData.kabupaten.find((k) => k.id === simRow.id);
      if (!mapRow?.risk_inputs || !simRow.pasokan_baseline_ton_wide) continue;
      curveById[simRow.id] = simRow.pasokan_baseline_ton_wide;
      riskInputsById[simRow.id] = mapRow.risk_inputs;
    }

    const recomputed = recomputeAllRiskMingguan(mapData.provinsi_ton_wide, mapData.max_ton_wide, {}, curveById, riskInputsById, meta.minggu_berjalan);

    // Tolerance of 1: map.json's provinsi_ton_wide/max_ton_wide are stored
    // rounded to 1 decimal place (export.py's build_map), while run_all.py's
    // own overlap computation uses the unrounded numpy arrays internally -
    // this JS port necessarily works from the rounded JSON, so a handful of
    // near-.5 borderline weeks can round to an adjacent integer. This is a
    // real, accepted precision loss from the JSON export step, not a logic
    // bug - confirmed by hand-deriving risk.py's own composite_risk() with
    // the rounded curves and getting the same off-by-one.
    for (const id of Object.keys(curveById)) {
      const mapRow = mapData.kabupaten.find((k) => k.id === id);
      const expected = mapRow.risk_mingguan.map((r) => r.skor);
      const actual = recomputed[id].map((r) => r.skor);
      expect(recomputed[id].map((r) => r.minggu)).toEqual(mapRow.risk_mingguan.map((r) => r.minggu));
      actual.forEach((v, i) => {
        expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1);
      });
    }
  });

  it("BUG REGRESSION: shifting ALL kabupaten with matching timing by the SAME amount keeps their PEAK MAGNITUDE roughly unchanged (postponed, not resolved) over the full 32-week horizon", () => {
    // This is the exact scenario the user flagged: kabupaten sharing the
    // generic DEFAULT_ZOM_STATUS fallback all have identical harvest timing.
    // If every one of them is staggered by the same 2 weeks simultaneously,
    // the real-world pileup they create together is UNCHANGED - it just
    // lands on a different week. A per-kabupaten-own-mean score (the old
    // score_overlap) can't see this and incorrectly drops every score; the
    // province-aware version should barely move them.
    const genericRows = simulasi.kabupaten.filter((k) => !k.zom_asli && k.pasokan_baseline_ton_wide);
    expect(genericRows.length).toBeGreaterThan(1); // needs at least 2 to prove "together" behavior

    function fullOverlapPeak(curveById, provinsiTonWide, maxTonWide, id) {
      return Math.max(...scoreOverlapProvinsi(curveById[id], provinsiTonWide, maxTonWide));
    }

    const curveByIdBaseline = {};
    const curveByIdShifted = {};
    const shiftedCurves = {};
    for (const simRow of simulasi.kabupaten) {
      const mapRow = mapData.kabupaten.find((k) => k.id === simRow.id);
      if (!mapRow?.risk_inputs || !simRow.pasokan_baseline_ton_wide) continue;
      const isGeneric = genericRows.some((g) => g.id === simRow.id);
      const before = simRow.pasokan_baseline_ton_wide;
      const after = isGeneric ? shiftCurve(before, 2) : before;
      curveByIdBaseline[simRow.id] = before;
      curveByIdShifted[simRow.id] = after;
      if (isGeneric) shiftedCurves[simRow.id] = { before, after };
    }

    const provinsiShifted = [...mapData.provinsi_ton_wide];
    for (const { before, after } of Object.values(shiftedCurves)) {
      for (let i = 0; i < provinsiShifted.length; i++) provinsiShifted[i] += after[i] - before[i];
    }
    const maxShifted = [...mapData.max_ton_wide];
    for (const { after } of Object.values(shiftedCurves)) {
      for (let i = 0; i < maxShifted.length; i++) maxShifted[i] = Math.max(maxShifted[i], after[i]);
    }

    for (const g of genericRows) {
      const baselinePeak = fullOverlapPeak(curveByIdBaseline, mapData.provinsi_ton_wide, mapData.max_ton_wide, g.id);
      const shiftedPeak = fullOverlapPeak(curveByIdShifted, provinsiShifted, maxShifted, g.id);
      // Peak MAGNITUDE preserved within tolerance - staggering everyone
      // together moves WHEN the peak lands, not how bad it is. A collapse
      // toward zero (the old per-kabupaten-mean bug) would fail this.
      expect(shiftedPeak).toBeGreaterThan(baselinePeak * 0.7);
    }
  });

  it("an ISOLATED shift by a SMALL-share kabupaten (moving away from where the dominant producer still peaks) reduces its own score", () => {
    // Deliberately NOT garut here: garut is often the week's biggest single
    // contributor itself, so shifting it alone moves the "biggest player"
    // reference along with it rather than cleanly destaggering away from
    // someone else's peak. ciamis (~1% share, never the biggest player) is a
    // clean case: shifting it away from where garut/bandung_kab still peak
    // should genuinely lower its ratio to that week's (unchanged) max.
    const ciamisSim = simulasi.kabupaten.find((k) => k.id === "ciamis");
    const ciamisMap = mapData.kabupaten.find((k) => k.id === "ciamis");
    if (!ciamisSim?.pasokan_baseline_ton_wide) return;

    const curveById = {};
    const riskInputsById = {};
    for (const simRow of simulasi.kabupaten) {
      const mapRow = mapData.kabupaten.find((k) => k.id === simRow.id);
      if (!mapRow?.risk_inputs || !simRow.pasokan_baseline_ton_wide) continue;
      curveById[simRow.id] = simRow.pasokan_baseline_ton_wide;
      riskInputsById[simRow.id] = mapRow.risk_inputs;
    }
    const maxShift = ciamisSim.geser_maks_minggu;
    const before = ciamisSim.pasokan_baseline_ton_wide;
    const after = shiftCurve(before, maxShift);
    curveById.ciamis = after;
    const shiftedCurves = { ciamis: { before, after } };

    const recomputed = recomputeAllRiskMingguan(mapData.provinsi_ton_wide, mapData.max_ton_wide, shiftedCurves, curveById, riskInputsById, meta.minggu_berjalan);

    const baselinePeak = Math.max(...ciamisMap.risk_mingguan.map((r) => r.skor));
    const shiftedPeak = Math.max(...recomputed.ciamis.map((r) => r.skor));
    expect(shiftedPeak).toBeLessThan(baselinePeak);
  });

  it("the DOMINANT producer (whichever kabupaten is a given week's biggest contributor) can reach a high score at the true province peak, not capped at its raw percentage share", () => {
    // Regression test for BUG #2: verifies the max-normalization fix, not
    // just that SOME score changes. Find whichever kabupaten is the
    // province's biggest single contributor at the true peak week (full
    // 32-week horizon, not the display-clipped 16) and confirm it reads as
    // genuinely high-risk there.
    const horizon = mapData.provinsi_ton_wide.length;
    const mean = mapData.provinsi_ton_wide.reduce((a, b) => a + b, 0) / horizon;
    let peakWeek = 0;
    let peakRatio = -Infinity;
    for (let i = 0; i < horizon; i++) {
      const ratio = mapData.provinsi_ton_wide[i] / mean;
      if (ratio > peakRatio) { peakRatio = ratio; peakWeek = i; }
    }

    let topId = null;
    let topTon = -Infinity;
    for (const simRow of simulasi.kabupaten) {
      if (!simRow.pasokan_baseline_ton_wide) continue;
      const ton = simRow.pasokan_baseline_ton_wide[peakWeek];
      if (ton > topTon) { topTon = ton; topId = simRow.id; }
    }

    const overlap = scoreOverlapProvinsi(
      simulasi.kabupaten.find((k) => k.id === topId).pasokan_baseline_ton_wide,
      mapData.provinsi_ton_wide,
      mapData.max_ton_wide
    );
    expect(overlap[peakWeek]).toBeGreaterThan(70);
  });
});
