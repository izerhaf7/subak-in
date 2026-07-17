// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Landing from "./Landing.jsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const readJson = (p) => JSON.parse(readFileSync(path.join(PUBLIC_DIR, p), "utf8"));

// Data ASLI dari disk, bukan fixture: kalau run_all.py mengubah bentuk data,
// tes ini yang gagal duluan — bukan demo di depan juri.
const mapData = readJson("data/map.json");
const geo = readJson("geo/jabar_kabupaten.svg.json");

vi.mock("../lib/loadData.js", () => ({
  loadMap: vi.fn(),
  loadGeo: vi.fn(),
}));

import { loadMap, loadGeo } from "../lib/loadData.js";

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
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("Landing", () => {
  it("menampilkan headline tanpa menunggu data apa pun", () => {
    render(<Landing onMasuk={() => {}} />);
    expect(screen.getByText(/Synchronize Harvests/)).toBeTruthy();
  });

  it("CTA utama membawa ke peta", async () => {
    const onMasuk = vi.fn();
    render(<Landing onMasuk={onMasuk} />);
    fireEvent.click(screen.getByRole("button", { name: /Buka Peta Risiko/ }));
    expect(onMasuk).toHaveBeenCalledWith("peta_simulasi");
  });

  it("CTA kedua membawa ke Panen Darurat", async () => {
    const onMasuk = vi.fn();
    render(<Landing onMasuk={onMasuk} />);
    fireEvent.click(screen.getByRole("button", { name: /Panen Darurat/ }));
    expect(onMasuk).toHaveBeenCalledWith("panen_darurat");
  });

  it("peta gagal dimuat: hero tetap tampil dan CTA tetap bisa diklik", async () => {
    loadMap.mockRejectedValue(new Error("map.json (status 404)"));
    loadGeo.mockRejectedValue(new Error("geometri peta (status 404)"));
    const onMasuk = vi.fn();
    render(<Landing onMasuk={onMasuk} />);

    await waitFor(() => expect(screen.getByText(/Synchronize Harvests/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Buka Peta Risiko/ }));
    expect(onMasuk).toHaveBeenCalledWith("peta_simulasi");
  });

  it("menampilkan 3 kartu fitur (Peta Risiko, Simulasi Tanam, Panen Darurat)", () => {
    render(<Landing onMasuk={() => {}} />);
    expect(screen.getByText("Peta Risiko")).toBeTruthy();
    expect(screen.getByText("Simulasi Tanam")).toBeTruthy();
    // "Panen Darurat" juga jadi label tombol CTA kedua di hero - cocokkan
    // yang berupa heading kartu fitur (h3), bukan sekadar teks manapun.
    expect(screen.getByRole("heading", { name: "Panen Darurat" })).toBeTruthy();
  });

  it("topbar landing punya link jangkar ke Beranda, Fitur, dan FAQ", () => {
    render(<Landing onMasuk={() => {}} />);
    expect(screen.getByRole("link", { name: "Beranda" }).getAttribute("href")).toBe("#landing-hero");
    expect(screen.getByRole("link", { name: "Fitur" }).getAttribute("href")).toBe("#landing-fitur");
    expect(screen.getByRole("link", { name: "FAQ" }).getAttribute("href")).toBe("#landing-faq");
  });

  it("FAQ dirender sebagai accordion collapsible, jawaban tersembunyi sampai dibuka", () => {
    render(<Landing onMasuk={() => {}} />);
    const pertanyaan = screen.getByText(/apa yang membedakan subakin/i);
    const item = pertanyaan.closest("details");
    expect(item.open).toBe(false);
    fireEvent.click(pertanyaan);
    expect(item.open).toBe(true);
  });
});
