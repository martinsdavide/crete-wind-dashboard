import { describe, it, expect } from "vitest";
import {
  calculateSolarTimes,
  getSolarWindow,
  isDaylightHour,
  DEFAULT_CRETE_LAT,
  DEFAULT_CRETE_LON,
} from "@/lib/solar";

describe("Astronomical Solar Calculations (NOAA Model)", () => {
  it("computes accurate summer solstice daylight window in Eastern Crete (June 21)", () => {
    // June 21 summer solstice
    const summerDate = new Date("2026-06-21T12:00:00.000Z");
    const window = getSolarWindow(summerDate, DEFAULT_CRETE_LAT, DEFAULT_CRETE_LON);

    // In Eastern Crete (UTC+3 DST in summer), June 21 sunrise is ~05:57, sunset is ~20:29
    expect(window.sunriseTime).toMatch(/^05:5[0-9]/);
    expect(window.sunsetTime).toMatch(/^20:2[0-9]/);
    expect(window.daylightDurationHours).toBeGreaterThan(14.0);
    expect(window.startHour).toBeLessThanOrEqual(6);
    expect(window.endHour).toBeGreaterThanOrEqual(20);
  });

  it("computes accurate winter solstice daylight window in Eastern Crete (December 21)", () => {
    // December 21 winter solstice
    const winterDate = new Date("2026-12-21T12:00:00.000Z");
    const window = getSolarWindow(winterDate, DEFAULT_CRETE_LAT, DEFAULT_CRETE_LON);

    // In Eastern Crete (UTC+2 in winter, 26.27°E), December 21 sunrise is ~07:19, sunset is ~17:06
    expect(window.sunriseTime).toMatch(/^07:[12][0-9]/);
    expect(window.sunsetTime).toMatch(/^17:[01][0-9]/);
    expect(window.daylightDurationHours).toBeLessThan(10.0);
    expect(window.startHour).toBe(7);
    expect(window.endHour).toBe(17);
  });

  it("computes accurate spring equinox daylight window (March 20)", () => {
    const springDate = new Date("2026-03-20T12:00:00.000Z");
    const window = getSolarWindow(springDate, DEFAULT_CRETE_LAT, DEFAULT_CRETE_LON);

    // Near 12h daylight duration
    expect(window.daylightDurationHours).toBeGreaterThanOrEqual(11.8);
    expect(window.daylightDurationHours).toBeLessThanOrEqual(12.3);
  });

  it("computes accurate daylight windows for other regions and timezones dynamically (e.g. Maremma Italy & Hawaii)", () => {
    // Maremma, Italy (42.7°N, 11.0°E, Europe/Rome)
    const italyDate = new Date("2026-06-21T12:00:00.000Z");
    const italyWindow = getSolarWindow(italyDate, 42.7, 11.0, "Europe/Rome");

    expect(italyWindow.sunriseTime).toMatch(/^05:3[0-9]/);
    expect(italyWindow.sunsetTime).toMatch(/^20:5[0-9]/);
    expect(italyWindow.startHour).toBeLessThanOrEqual(6);
    expect(italyWindow.endHour).toBeGreaterThanOrEqual(20);

    // Hawaii (20.9°N, -156.7°W, Pacific/Honolulu)
    const hawaiiDate = new Date("2026-06-21T22:00:00.000Z"); // Midday in Hawaii
    const hawaiiWindow = getSolarWindow(hawaiiDate, 20.9, -156.7, "Pacific/Honolulu");

    expect(hawaiiWindow.sunriseTime).toMatch(/^05:4[0-9]/);
    expect(hawaiiWindow.sunsetTime).toMatch(/^19:0[0-9]/);
  });
});
