// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import JabarMap from "./JabarMap.jsx";

afterEach(cleanup);

// Geo minimal dua wilayah — cukup untuk menguji atribut interaksi.
const geo = {
  viewBox: "0 0 100 100",
  water: "M0 0 L10 0 L10 10 Z",
  kabupaten: {
    garut: { path: "M0 0 L10 0 L10 10 Z", labelX: 5, labelY: 5 },
    depok: { path: "M20 0 L30 0 L30 10 Z", labelX: 25, labelY: 5 },
  },
};

const mapData = {
  kabupaten: [
    { id: "garut", nama: "Kab. Garut", status_data: "measured", risk_mingguan: [{ minggu: 29, skor: 80 }] },
    { id: "depok", nama: "Kota Depok", status_data: "modeled", risk_mingguan: [{ minggu: 29, skor: 0 }] },
  ],
};

function renderMap(props) {
  return render(
    <JabarMap geo={geo} mapData={mapData} minggu={29} selectedId={null} onSelect={() => {}} {...props} />
  );
}

describe("JabarMap interaktif", () => {
  it("default: wilayah bisa difokus keyboard dan berperan sebagai tombol", () => {
    renderMap();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("interaktif={false}: nol tab stop — landing tidak boleh menyandera keyboard", () => {
    const { container } = renderMap({ interaktif: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("path[tabindex]")).toHaveLength(0);
  });

  it("interaktif={false}: peta tetap punya label untuk pembaca layar", () => {
    renderMap({ interaktif: false });
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("interaktif={false}: wilayah tetap diwarnai sesuai skor risiko", () => {
    const { container } = renderMap({ interaktif: false });
    const garut = container.querySelector('path[data-id="garut"]');
    expect(garut.getAttribute("fill")).toBe("#be123c"); // skor 80 -> critical
  });
});
