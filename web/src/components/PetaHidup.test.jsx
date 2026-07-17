// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import PetaHidup from "./PetaHidup.jsx";

const geo = {
  viewBox: "0 0 100 100",
  water: "M0 0 L10 0 L10 10 Z",
  kabupaten: { garut: { path: "M0 0 L10 0 L10 10 Z", labelX: 5, labelY: 5 } },
};

// W29 aman (hijau), W46 kritis (merah) -> warna path memberitahu minggu
// mana yang sedang tampil, tanpa perlu mengintip state internal.
const mapData = {
  kabupaten: [
    {
      id: "garut",
      nama: "Kab. Garut",
      status_data: "measured",
      risk_mingguan: [
        { minggu: 29, skor: 0 },
        { minggu: 46, skor: 90 },
      ],
    },
  ],
};

// jsdom tidak punya matchMedia. Semua browser sungguhan punya — stub ini ada
// murni supaya lingkungan tes tidak gagal pada sesuatu yang tidak pernah
// hilang di browser nyata.
function stubMatchMedia(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: reduce,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function warnaGarut(container) {
  return container.querySelector('path[data-id="garut"]').getAttribute("fill");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("PetaHidup", () => {
  it("mulai dari minggu pertama", () => {
    stubMatchMedia(false);
    const { container } = render(<PetaHidup geo={geo} mapData={mapData} />);
    expect(warnaGarut(container)).toBe("#a3e2b2"); // W29, skor 0
  });

  it("maju sendiri ke minggu berikutnya tanpa ada yang mengklik", () => {
    stubMatchMedia(false);
    const { container } = render(<PetaHidup geo={geo} mapData={mapData} />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(warnaGarut(container)).toBe("#be123c"); // W46, skor 90
  });

  it("mengulang dari awal setelah minggu terakhir", () => {
    stubMatchMedia(false);
    const { container } = render(<PetaHidup geo={geo} mapData={mapData} />);
    act(() => { vi.advanceTimersByTime(700 * 2); });
    expect(warnaGarut(container)).toBe("#a3e2b2"); // balik ke W29
  });

  it("prefers-reduced-motion: diam di minggu puncak risiko, bukan di minggu pertama", () => {
    stubMatchMedia(true);
    const { container } = render(<PetaHidup geo={geo} mapData={mapData} />);
    expect(warnaGarut(container)).toBe("#be123c"); // langsung W46
    act(() => { vi.advanceTimersByTime(700 * 5); });
    expect(warnaGarut(container)).toBe("#be123c"); // dan tetap diam di situ
  });

  it("tidak meledak kalau matchMedia tidak ada sama sekali", () => {
    delete window.matchMedia;
    expect(() => render(<PetaHidup geo={geo} mapData={mapData} />)).not.toThrow();
  });

  it("mengembalikan null kalau data belum ada", () => {
    stubMatchMedia(false);
    const { container } = render(<PetaHidup geo={null} mapData={null} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
