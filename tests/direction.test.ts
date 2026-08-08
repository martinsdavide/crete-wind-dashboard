import { describe, it, expect } from "vitest";
import {
  degreesToCompass,
  compassToArrowRotation,
  circularMeanDegrees,
  normalizeDegrees,
  getDominantDirection,
} from "@/lib/windDirection";

describe("Wind Direction Utilities", () => {
  it("converts exact cardinal & intercardinal degrees to 16-point compass directions", () => {
    expect(degreesToCompass(0)).toBe("N");
    expect(degreesToCompass(45)).toBe("NE");
    expect(degreesToCompass(90)).toBe("E");
    expect(degreesToCompass(135)).toBe("SE");
    expect(degreesToCompass(180)).toBe("S");
    expect(degreesToCompass(225)).toBe("SW");
    expect(degreesToCompass(270)).toBe("W");
    expect(degreesToCompass(315)).toBe("NW");
  });

  it("handles circular boundaries correctly", () => {
    expect(degreesToCompass(360)).toBe("N");
    expect(degreesToCompass(720)).toBe("N");
    expect(degreesToCompass(-45)).toBe("NW"); // 315

    // 0/360 boundary: 0 to 11.25 is N, 11.25 to 33.75 is NNE
    expect(degreesToCompass(11.24)).toBe("N");
    expect(degreesToCompass(11.26)).toBe("NNE");
    expect(degreesToCompass(348.74)).toBe("NNW");
    expect(degreesToCompass(348.76)).toBe("N");
  });

  it("calculates arrow rotation pointing where wind is blowing TO", () => {
    // Meteorological NW (315°) blows TO SE (135°)
    expect(compassToArrowRotation(315)).toBe(135);
    // Meteorological N (0°) blows TO S (180°)
    expect(compassToArrowRotation(0)).toBe(180);
    // Meteorological S (180°) blows TO N (0°)
    expect(compassToArrowRotation(180)).toBe(0);
    // Meteorological W (270°) blows TO E (90°)
    expect(compassToArrowRotation(270)).toBe(90);
  });

  it("calculates circular/vector average correctly for angles crossing 0°/360°", () => {
    // 350° and 10° should average to 0° (N), NOT 180° (S)
    const mean = circularMeanDegrees([350, 10]);
    expect(Math.round(mean)).toBe(0);

    const dominant = getDominantDirection([350, 10]);
    expect(dominant.label).toBe("N");
  });

  it("handles empty or invalid inputs gracefully", () => {
    expect(circularMeanDegrees([])).toBe(0);
    expect(normalizeDegrees(NaN)).toBe(0);
    expect(normalizeDegrees(Infinity)).toBe(0);
  });
});
