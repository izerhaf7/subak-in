import { describe, it, expect } from "vitest";
import { riskColor } from "./riskColor.js";

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
