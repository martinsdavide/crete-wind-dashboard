import { describe, it, expect } from "vitest";
import { findBestWindow } from "@/lib/bestWindow";
import { HourlyWind } from "@/types/weather";

function createMockHour(timeStr: string, score: number, localWind = 24): HourlyWind {
  return {
    timestamp: `2026-08-09T${timeStr}:00+03:00`,
    modelWind: 18,
    modelGust: 25,
    directionDegrees: 315,
    directionLabel: "NW",
    arrowRotation: 135,
    localWind,
    localGust: 28,
    correctionFactor: 1.33,
    confidence: 85,
    confidenceLevel: "HIGH",
    score,
    classification: "GREAT",
    condition: "VERY GOOD",
  };
}

describe("Best Window Algorithm", () => {
  it("identifies continuous qualifying window >= 70 score (spec example 13:00-17:00 / 18:00)", () => {
    // Spec input:
    // 12:00 -> 60
    // 13:00 -> 75
    // 14:00 -> 85
    // 15:00 -> 90
    // 16:00 -> 88
    // 17:00 -> 72
    // 18:00 -> 50
    const sequence = [
      createMockHour("12:00", 60),
      createMockHour("13:00", 75),
      createMockHour("14:00", 85),
      createMockHour("15:00", 90),
      createMockHour("16:00", 88),
      createMockHour("17:00", 72),
      createMockHour("18:00", 50),
    ];

    const window = findBestWindow(sequence, 70, 2);

    expect(window).not.toBeNull();
    expect(window?.start).toBe("13:00");
    expect(window?.end).toBe("18:00"); // 13:00 to 18:00 spans the 5 hours (13:00, 14:00, 15:00, 16:00, 17:00)
    expect(window?.durationHours).toBe(5);
    expect(window?.meanScore).toBe(Math.round((75 + 85 + 90 + 88 + 72) / 5)); // 82
    expect(window?.dominantDirection).toBe("NW");
  });

  it("returns null when no sequence meets the minimum duration or score", () => {
    const sequence = [
      createMockHour("12:00", 65),
      createMockHour("13:00", 75), // single hour >= 70
      createMockHour("14:00", 60),
    ];

    const window = findBestWindow(sequence, 70, 2);
    expect(window).toBeNull();
  });
});
