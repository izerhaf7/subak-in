import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadMeta, loadMap, loadKabupaten, loadGeo, loadSimulasi, loadAbsorbers, loadWeather } from "./loadData.js";

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
    await expect(loadMeta()).rejects.toThrow("meta.json (status 404)");
  });

  it("replaces the browser's English network error with a readable one", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(loadMeta()).rejects.toThrow("meta.json — koneksi terputus (network error)");
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

describe("loadSimulasi", () => {
  it("uses simulasi.json for cabai_rawit (the default, no suffix)", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ kabupaten: [] }) });
    await loadSimulasi();
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/simulasi.json");
  });

  it("uses simulasi_<komoditas>.json for other komoditas", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ kabupaten: [] }) });
    await loadSimulasi("bawang_merah");
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/simulasi_bawang_merah.json");
  });
});

describe("loadAbsorbers", () => {
  it("fetches absorbers.json", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ absorbers: [] }) });
    await loadAbsorbers();
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/absorbers.json");
  });
});

describe("loadWeather", () => {
  it("fetches weather.json (the cached BMKG scrape, never the live API)", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ per_kabupaten: [] }) });
    await loadWeather();
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/weather.json");
  });
});
