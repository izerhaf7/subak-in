// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AngkaMasalah from "./AngkaMasalah.jsx";

afterEach(cleanup);

const sorotan = {
  id: "tasikmalaya_kab",
  nama: "Kab. Tasikmalaya",
  puncakRp: 70000,
  dasarRp: 19850,
  turunPersen: 72,
  nMinggu: 52,
};

describe("AngkaMasalah", () => {
  it("menampilkan persen penurunan, rentang harga, horizon, dan minggu puncak", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByText(/Rp70\.000/)).toBeTruthy();
    expect(screen.getByText(/Rp19\.850/)).toBeTruthy();
    expect(screen.getByText("20 minggu")).toBeTruthy();
    expect(screen.getByText("W46")).toBeTruthy();
  });

  it("menyebut kabupaten dan komoditasnya, bukan teks generik", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText(/Kab\. Tasikmalaya/)).toBeTruthy();
    expect(screen.getByText(/Cabai Rawit/)).toBeTruthy();
  });

  it("mencantumkan footnote sumber — angka tanpa asal-usul tidak boleh tampil", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText(/PIHPS/)).toBeTruthy();
  });

  it("sorotan null: kolom harga DAN footnote hilang, horizon tetap ada", () => {
    render(
      <AngkaMasalah sorotan={null} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.queryByText("72%")).toBeNull();
    expect(screen.queryByText(/PIHPS/)).toBeNull();
    expect(screen.getByText("20 minggu")).toBeTruthy();
    expect(screen.getByText("W46")).toBeTruthy();
  });

  it("mingguPuncak null: kolomnya hilang, tidak merender 'W null'", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={null} komoditasNama="Cabai Rawit" />
    );
    expect(screen.queryByText(/W\s*null/)).toBeNull();
    expect(screen.getByText("72%")).toBeTruthy();
  });
});
