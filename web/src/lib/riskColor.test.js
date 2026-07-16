import { describe, it, expect } from "vitest";
import { riskColor } from "./riskColor.js";

describe("riskColor", () => {
  it("returns the lightest band for low risk", () => {
    expect(riskColor(0)).toBe("#cc9685");
    expect(riskColor(24)).toBe("#cc9685");
  });

  it("returns the second band", () => {
    expect(riskColor(25)).toBe("#ad644e");
    expect(riskColor(49)).toBe("#ad644e");
  });

  it("returns the accent band", () => {
    expect(riskColor(50)).toBe("#8a3f28");
    expect(riskColor(74)).toBe("#8a3f28");
  });

  it("returns the darkest band for peak risk", () => {
    expect(riskColor(75)).toBe("#56200f");
    expect(riskColor(100)).toBe("#56200f");
  });

  it("clamps out-of-range scores instead of throwing", () => {
    expect(riskColor(-10)).toBe("#cc9685");
    expect(riskColor(150)).toBe("#56200f");
  });
});
