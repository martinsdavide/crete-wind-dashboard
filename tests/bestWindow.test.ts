import { describe, it, expect } from "vitest";
import { findBestWindow } from "@/lib/bestWindow";
import { HourlyWind } from "@/types/weather";

function createMockHour(timeStr: string, score: number, localWind = 24): HourlyWind {
  return {
    timestamp: `2026-08-09T${timeStr}:00.000Z`,
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
  it("identifies continuous qualifying window >= 70 score (spec example 13:00-18:00)", () => {
    // 12:00 -> 60
    // 13:00 -> 75
    // 14:00 -> 85
    // 15:00 -> 90
    // 16:00 -> 88
    // 17:00 -> 72
    // 18:00 -> 50
    const sequence = [
      createMockHour("10:00", 60), // Athens 13:00 is UTC 10:00 (UTC+3 in summer)
      createMockHour("11:00", 75), // Athens 14:00
      createMockHour("12:00", 85), // Athens 15:00
      createMockHour("13:00", 90), // Athens 16:00
      createMockHour("14:00", 88), // Athens 17:00
      createMockHour("15:00", 72), // Athens 18:00
      createMockHour("16:00", 50), // Athens 19:00
    ];

    const window = findBestWindow(sequence, 70, 2);

    expect(window).not.toBeNull();
    expect(window?.start).toBe("14:00");
    expect(window?.end).toBe("19:00");
    expect(window?.durationHours).toBe(5);
    expect(window?.meanScore).toBe(Math.round((75 + 85 + 90 + 88 + 72) / 5));
    expect(window?.dominantDirection).toBe("NW");
  });

  it("breaks continuous sequence if there is a missing/skipped hour in data", () => {
    const sequenceWithGap = [
      createMockHour("10:00", 85), // point 1
      // 11:00 is missing!
      createMockHour("12:00", 85), // point 2 (gap of 2 hours)
      createMockHour("13:00", 85), // point 3
    ];

    // Since 10:00 is isolated (1 hour duration), the qualifying window is 12:00 - 14:00 (2 hours)
    const window = findBestWindow(sequenceWithGap, 70, 2);
    expect(window).not.toBeNull();
    expect(window?.durationHours).toBe(2);
  });

  it("returns null when no sequence meets the minimum duration or score", () => {
    const sequence = [
      createMockHour("10:00", 65),
      createMockHour("11:00", 75),
      createMockHour("12:00", 60),
    ];

    const window = findBestWindow(sequence, 70, 2);
    expect(window).toBeNull();
  });
});
