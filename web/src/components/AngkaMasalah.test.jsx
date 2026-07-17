// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AngkaMasalah from "./AngkaMasalah.jsx";

afterEach(cleanup);

// nMingguJatuh (13) dan nMinggu (52) SENGAJA dibuat beda di fixture ini —
// itu inti dari perbaikannya. nMingguJatuh harus memberi makan label turun
// ("dalam 13 minggu"), nMinggu harus memberi makan footnote sumber saja
// ("52 minggu terakhir"). Kalau keduanya tertukar, tes di bawah gagal.
const sorotan = {
  id: "cirebon_kab",
  nama: "Kab. Cirebon",
  puncakRp: 42125,
  dasarRp: 18250,
  turunPersen: 57,
  nMingguJatuh: 13,
  nMinggu: 52,
};

describe("AngkaMasalah", () => {
  it("menampilkan persen penurunan, rentang harga, horizon, dan minggu puncak", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText("57%")).toBeTruthy();
    expect(screen.getByText(/Rp42\.125/)).toBeTruthy();
    expect(screen.getByText(/Rp18\.250/)).toBeTruthy();
    expect(screen.getByText("20 minggu")).toBeTruthy();
    expect(screen.getByText("W46")).toBeTruthy();
  });

  it("label turun pakai nMingguJatuh (13), BUKAN nMinggu (52)", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText(/dalam 13 minggu/)).toBeTruthy();
    expect(screen.queryByText(/dalam 52 minggu/)).toBeNull();
  });

  it("footnote sumber pakai nMinggu (52), BUKAN nMingguJatuh (13)", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText(/52 minggu terakhir/)).toBeTruthy();
  });

  it("menyebut kabupaten dan komoditasnya, bukan teks generik", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={46} komoditasNama="Cabai Rawit" />
    );
    expect(screen.getByText(/Kab\. Cirebon/)).toBeTruthy();
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
    expect(screen.queryByText("57%")).toBeNull();
    expect(screen.queryByText(/PIHPS/)).toBeNull();
    expect(screen.getByText("20 minggu")).toBeTruthy();
    expect(screen.getByText("W46")).toBeTruthy();
  });

  it("mingguPuncak null: kolomnya hilang, tidak merender 'W null'", () => {
    render(
      <AngkaMasalah sorotan={sorotan} horizonMinggu={20} mingguPuncak={null} komoditasNama="Cabai Rawit" />
    );
    expect(screen.queryByText(/W\s*null/)).toBeNull();
    expect(screen.getByText("57%")).toBeTruthy();
  });
});
