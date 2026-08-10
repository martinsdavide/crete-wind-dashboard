import { describe, it, expect } from "vitest";
import { findBestWindow } from "@/lib/bestWindow";
import { HourlyWind } from "@/types/weather";

function createMockHour(timeStr: string, sessionQualityScore: number, localWind = 24): HourlyWind {
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
    eligibility: "IDEAL",
    waterState: "BUMP_AND_JUMP",
    spotWindQuality: sessionQualityScore,
    directionQuality: 100,
    preferenceScore: 90,
    sessionQualityScore,
    score: sessionQualityScore,
    classification: "GREAT",
    condition: "VERY GOOD",
  };
}

describe("Best Window Algorithm", () => {
  it("identifies continuous qualifying window >= 70 score (spec example 13:00-18:00)", () => {
    // 10:00 UTC (13:00 Athens) -> 60
    // 11:00 UTC (14:00 Athens) -> 75
    // 12:00 UTC (15:00 Athens) -> 85
    // 13:00 UTC (16:00 Athens) -> 90
    // 14:00 UTC (17:00 Athens) -> 88
    // 15:00 UTC (18:00 Athens) -> 72
    // 16:00 UTC (19:00 Athens) -> 50
    const sequence = [
      createMockHour("10:00", 60), // Athens 13:00 is UTC 10:00
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
    expect(window?.sailingStyle).toBe("BUMP_AND_JUMP");
  });

  it("strictly clamps window end time to sunset (20:00) and never outputs 21:00", () => {
    // Late afternoon session going into 17:00 UTC (20:00 Athens)
    const lateSequence = [
      createMockHour("13:00", 80), // Athens 16:00
      createMockHour("14:00", 85), // Athens 17:00
      createMockHour("15:00", 88), // Athens 18:00
      createMockHour("16:00", 82), // Athens 19:00
      createMockHour("17:00", 78), // Athens 20:00
    ];

    const window = findBestWindow(lateSequence, 70, 2);
    expect(window).not.toBeNull();
    expect(window?.start).toBe("16:00");
    expect(window?.end).toBe("20:00"); // Capped at sunset (20:00) instead of 21:00
  });

  it("breaks continuous sequence if there is a missing/skipped hour in data", () => {
    const sequenceWithGap = [
      createMockHour("10:00", 85), // point 1
      // 11:00 is missing!
      createMockHour("12:00", 85), // point 2 (gap of 2 hours)
      createMockHour("13:00", 85), // point 3
    ];

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
