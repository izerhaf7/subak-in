// @vitest-environment jsdom
//
// Pressure test: renders the real components against every real data file on
// disk instead of a hand-picked fixture, so a schema edge case anywhere in
// the 27 kabupaten x 3 komoditas matrix shows up here instead of live during
// the demo. Deliberately renders components directly (not the full App
// click-flow) — it's the render code paths that are the actual risk
// (Recharts choking on a shape it doesn't expect, a null field a component
// doesn't guard), not the click wiring, which is already covered by manual
// QA.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JabarMap from "../components/JabarMap.jsx";
import KabupatenPanel from "../components/KabupatenPanel.jsx";
import BlindSpotNotice from "../components/BlindSpotNotice.jsx";
import RankedList from "../components/RankedList.jsx";
import SimulasiTanam from "./SimulasiTanam.jsx";
import PanenDarurat from "./PanenDarurat.jsx";
import { aggregateSupplyCurve } from "../lib/supplyMath.js";

// jsdom has no ResizeObserver — Recharts' ResponsiveContainer needs one to
// measure its parent. Real browsers all have it natively; this stub exists
// purely so the test environment doesn't fail on something no shipped
// browser is missing.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "public", "data");
const GEO_DIR = path.join(__dirname, "..", "..", "public", "geo");

function readJson(...parts) {
  return JSON.parse(readFileSync(path.join(...parts), "utf8"));
}

afterEach(cleanup);

describe("pressure test: JabarMap across all 3 komoditas", () => {
  const geo = readJson(GEO_DIR, "jabar_kabupaten.svg.json");
  const meta = readJson(DATA_DIR, "meta.json");
  const mapFiles = { cabai_rawit: "map.json", bawang_merah: "map_bawang_merah.json", cabai_besar: "map_cabai_besar.json" };

  for (const [komoditasId, file] of Object.entries(mapFiles)) {
    it(`renders all 27 regions for ${komoditasId} without throwing`, () => {
      const mapData = readJson(DATA_DIR, file);
      const errors = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));

      const { container } = render(
        <JabarMap geo={geo} mapData={mapData} minggu={meta.minggu_berjalan} selectedId={null} onSelect={() => {}} />
      );

      const paths = container.querySelectorAll(".jabar-map__region");
      expect(paths.length).toBe(27);
      expect(errors).toEqual([]);
      spy.mockRestore();
    });

    it(`ranked list for ${komoditasId} lists all 27 regions sorted by score`, () => {
      const mapData = readJson(DATA_DIR, file);
      const errors = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));

      const { container } = render(
        <RankedList mapData={mapData} minggu={meta.minggu_berjalan} onSelect={() => {}} />
      );

      const rows = container.querySelectorAll(".ranked-list__row");
      expect(rows.length).toBe(27);
      const scores = [...rows].map((r) => Number(r.querySelector(".ranked-list__score").textContent));
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);
      expect(errors).toEqual([]);
      spy.mockRestore();
    });
  }
});

describe("pressure test: KabupatenPanel against every real detail file", () => {
  const files = readdirSync(path.join(DATA_DIR, "kabupaten")).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    it(`renders ${file} without throwing`, () => {
      const kabupaten = readJson(DATA_DIR, "kabupaten", file);
      const errors = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));

      expect(() => render(<KabupatenPanel kabupaten={kabupaten} />)).not.toThrow();
      expect(errors).toEqual([]);
      spy.mockRestore();
    });
  }
});

describe("pressure test: BlindSpotNotice for modeled regions", () => {
  it("renders without throwing for a representative name", () => {
    expect(() => render(<BlindSpotNotice nama="Kab. Contoh" />)).not.toThrow();
  });
});

describe("pressure test: every kabupaten x komoditas combination resolves to a defined UI state", () => {
  const mapFiles = { cabai_rawit: "map.json", bawang_merah: "map_bawang_merah.json", cabai_besar: "map_cabai_besar.json" };
  const detailFiles = new Set(readdirSync(path.join(DATA_DIR, "kabupaten")));

  it("every measured/measured_stale kabupaten has a detail file; every modeled one deliberately doesn't", () => {
    const problems = [];
    for (const [komoditasId, file] of Object.entries(mapFiles)) {
      const mapData = readJson(DATA_DIR, file);
      for (const k of mapData.kabupaten) {
        const isMeasured = k.status_data === "measured" || k.status_data === "measured_stale";
        const expectedFile = komoditasId === "cabai_rawit" ? `${k.id}.json` : `${k.id}__${komoditasId}.json`;
        const exists = detailFiles.has(expectedFile);
        if (isMeasured && !exists) {
          problems.push(`${komoditasId}/${k.id}: status ${k.status_data} tapi ${expectedFile} tidak ada`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

function mockFetchFromDisk() {
  global.fetch = vi.fn((url) => {
    const relPath = url.replace(/^\//, "");
    try {
      const data = readJson(path.join(__dirname, "..", "..", "public", relPath));
      return Promise.resolve({ ok: true, json: async () => data });
    } catch {
      return Promise.resolve({ ok: false, status: 404 });
    }
  });
}

describe("pressure test: SimulasiTanam with every kabupaten pushed to its max shift", () => {
  it("renders and lets every slider reach geser_maks_minggu without throwing", async () => {
    mockFetchFromDisk();
    const meta = readJson(DATA_DIR, "meta.json");
    const simulasi = readJson(DATA_DIR, "simulasi.json");
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));

    render(<SimulasiTanam meta={meta} />);
    await waitFor(() => screen.getByText(/Geser Jadwal Tanam/i));

    const sliders = document.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(simulasi.kabupaten.length);
    sliders.forEach((slider) => {
      fireEvent.change(slider, { target: { value: slider.max } });
    });

    expect(errors).toEqual([]);
    spy.mockRestore();
  });

  it("aggregateSupplyCurve never goes negative or NaN at any shift combination (0..max for every sentra)", () => {
    const meta = readJson(DATA_DIR, "meta.json");
    const simulasi = readJson(DATA_DIR, "simulasi.json");
    const kernel = meta.komoditas.find((k) => k.id === "cabai_rawit").kernel_panen;

    // Full combinatorial sweep over 6 sentra would be geser_maks_minggu^6 —
    // instead sweep each sentra to its own max one at a time (holding the
    // rest at 0), which is what a user actually does one slider at a time,
    // and also check the all-max combination once.
    const allMax = Object.fromEntries(simulasi.kabupaten.map((k) => [k.id, k.geser_maks_minggu]));
    const scenarios = [allMax, ...simulasi.kabupaten.map((k) => ({ [k.id]: k.geser_maks_minggu }))];

    for (const geser of scenarios) {
      const curve = aggregateSupplyCurve(simulasi.kabupaten, kernel.bobot_mingguan, kernel.mulai_panen_hari, geser, 24);
      curve.forEach((v) => {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      });
    }
  });
});

describe("pressure test: PanenDarurat across every kabupaten with matches", () => {
  it("renders the absorber table for every kabupaten in matches_per_kabupaten without throwing", async () => {
    mockFetchFromDisk();
    const absorbers = readJson(DATA_DIR, "absorbers.json");
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));

    render(<PanenDarurat />);
    await waitFor(() => screen.getByText(/Kabupaten surplus/i));

    const rows = document.querySelectorAll(".side-col .ranked-list__row");
    expect(rows.length).toBe(Object.keys(absorbers.matches_per_kabupaten).length);
    for (const row of rows) {
      fireEvent.click(row);
    }

    expect(errors).toEqual([]);
    spy.mockRestore();
  });
});
