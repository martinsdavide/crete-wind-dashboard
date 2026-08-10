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

    // In Eastern Crete (UTC+3 DST in summer), June 21 sunrise is ~06:05, sunset is ~20:38
    expect(window.sunriseTime).toMatch(/^06:0[0-9]/);
    expect(window.sunsetTime).toMatch(/^20:3[0-9]/);
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

  it("correctly identifies daytime vs nighttime timestamps via isDaylightHour", () => {
    // August summer day (UTC+3 in Athens)
    // 12:00 UTC is 15:00 Athens -> Daylight
    expect(isDaylightHour("2026-08-10T12:00:00.000Z")).toBe(true);

    // 00:00 UTC is 03:00 Athens -> Night
    expect(isDaylightHour("2026-08-10T00:00:00.000Z")).toBe(false);

    // 22:00 UTC is 01:00 Athens -> Night
    expect(isDaylightHour("2026-08-10T22:00:00.000Z")).toBe(false);
  });
});
