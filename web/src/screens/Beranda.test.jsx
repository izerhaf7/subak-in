// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Beranda from "./Beranda.jsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const readJson = (p) => JSON.parse(readFileSync(path.join(PUBLIC_DIR, p), "utf8"));

// Data ASLI dari disk, bukan fixture: kalau run_all.py mengubah bentuk data,
// tes ini yang gagal duluan — bukan demo di depan juri.
const meta = readJson("data/meta.json");
const mapData = readJson("data/map.json");
const geo = readJson("geo/jabar_kabupaten.svg.json");

vi.mock("../lib/loadData.js", () => ({
  loadMap: vi.fn(),
  loadGeo: vi.fn(),
  loadKabupaten: vi.fn(),
}));

import { loadMap, loadGeo, loadKabupaten } from "../lib/loadData.js";

function stubMatchMedia(reduce = false) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: reduce, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  stubMatchMedia(true); // diam: tidak perlu timer berjalan di tes ini
  loadGeo.mockResolvedValue(geo);
  loadMap.mockResolvedValue(mapData);
  loadKabupaten.mockImplementation((id) => Promise.resolve(readJson(`data/kabupaten/${id}.json`)));
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("Beranda", () => {
  it("menampilkan headline tanpa menunggu data apa pun", () => {
    render(<Beranda meta={meta} onMasuk={() => {}} />);
    expect(screen.getByText(/Harga anjlok bukan kejutan/)).toBeTruthy();
  });

  it("menghitung jumlah kabupaten dari data — kota tidak ikut", async () => {
    render(<Beranda meta={meta} onMasuk={() => {}} />);
    // 27 wilayah di map.json - 9 kota = 18 kabupaten yang dianalisis.
    await waitFor(() => expect(screen.getByText(/18 kabupaten/)).toBeTruthy());
  });

  it("menampilkan angka penurunan harga dari data asli", async () => {
    render(<Beranda meta={meta} onMasuk={() => {}} />);
    await waitFor(() => expect(screen.getByText(/%$/)).toBeTruthy());
    expect(screen.getByText(/PIHPS/)).toBeTruthy();
  });

  it("hanya memuat file kabupaten yang measured — bukan semua 27", async () => {
    render(<Beranda meta={meta} onMasuk={() => {}} />);
    await waitFor(() => expect(loadKabupaten).toHaveBeenCalled());
    const measured = mapData.kabupaten.filter((k) => k.status_data === "measured").length;
    expect(loadKabupaten).toHaveBeenCalledTimes(measured);
  });

  it("CTA utama membawa ke peta", async () => {
    const onMasuk = vi.fn();
    render(<Beranda meta={meta} onMasuk={onMasuk} />);
    fireEvent.click(screen.getByRole("button", { name: /Buka Peta Risiko/ }));
    expect(onMasuk).toHaveBeenCalledWith("peta_simulasi");
  });

  it("CTA kedua membawa ke Panen Darurat", async () => {
    const onMasuk = vi.fn();
    render(<Beranda meta={meta} onMasuk={onMasuk} />);
    fireEvent.click(screen.getByRole("button", { name: /Panen Darurat/ }));
    expect(onMasuk).toHaveBeenCalledWith("panen_darurat");
  });

  it("peta gagal dimuat: hero tetap tampil dan CTA tetap bisa diklik", async () => {
    loadMap.mockRejectedValue(new Error("map.json (status 404)"));
    loadGeo.mockRejectedValue(new Error("geometri peta (status 404)"));
    const onMasuk = vi.fn();
    render(<Beranda meta={meta} onMasuk={onMasuk} />);

    await waitFor(() => expect(screen.getByText(/Harga anjlok bukan kejutan/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Buka Peta Risiko/ }));
    expect(onMasuk).toHaveBeenCalledWith("peta_simulasi");
  });

  it("file kabupaten gagal: kolom harga hilang, halaman tetap hidup", async () => {
    loadKabupaten.mockRejectedValue(new Error("garut.json (status 404)"));
    render(<Beranda meta={meta} onMasuk={() => {}} />);

    // Pencocokan string (exact), BUKAN regex: beranda_sub juga mengandung
    // "20 minggu" ("...— 20 minggu sebelum harga jatuh"), jadi /20 minggu/
    // akan cocok dengan dua elemen dan getByText melempar error.
    await waitFor(() => expect(screen.getByText("20 minggu")).toBeTruthy());
    expect(screen.queryByText(/PIHPS/)).toBeNull();
  });
});
