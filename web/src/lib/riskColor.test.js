import { describe, it, expect } from "vitest";
import { riskColor, riskTextColor } from "./riskColor.js";

describe("riskColor", () => {
  it("returns the lightest band for low risk", () => {
    expect(riskColor(0)).toBe("#a3e2b2");
    expect(riskColor(24)).toBe("#a3e2b2");
  });

  it("returns the second band", () => {
    expect(riskColor(25)).toBe("#fcd34d");
    expect(riskColor(49)).toBe("#fcd34d");
  });

  it("returns the accent band", () => {
    expect(riskColor(50)).toBe("#f97316");
    expect(riskColor(74)).toBe("#f97316");
  });

  it("returns the darkest band for peak risk", () => {
    expect(riskColor(75)).toBe("#be123c");
    expect(riskColor(100)).toBe("#be123c");
  });

  it("clamps out-of-range scores instead of throwing", () => {
    expect(riskColor(-10)).toBe("#a3e2b2");
    expect(riskColor(150)).toBe("#be123c");
  });
});

describe("riskTextColor", () => {
  it("darkens the low/mid bands (riskColor's pastel tones fail as body text contrast)", () => {
    expect(riskTextColor(0)).toBe("#1f7a37");
    expect(riskTextColor(30)).toBe("#92720a");
  });

  it("matches riskColor for the already-dark high/critical bands", () => {
    expect(riskTextColor(60)).toBe(riskColor(60));
    expect(riskTextColor(90)).toBe(riskColor(90));
  });

  it("clamps out-of-range scores instead of throwing", () => {
    expect(riskTextColor(-10)).toBe("#1f7a37");
    expect(riskTextColor(150)).toBe("#be123c");
  });
});
