import { describe, it, expect } from "vitest";
import { ObservationQualityControl } from "@/engine/observations/ObservationQualityControl";
import { WeatherObservation } from "@/engine/observations/types";

describe("Observation Quality Control Tests", () => {
  const refTime = new Date("2026-08-12T12:00:00.000Z");

  it("marks fresh observation (5 min old) as valid with score 1.0", () => {
    const obs: Partial<WeatherObservation> = {
      stationId: "meteotrentino:T0193",
      observedAt: "2026-08-12T11:55:00.000Z",
      windSpeedMs: 8.5,
      windGustMs: 11.0,
      windDirectionDeg: 180,
    };

    const quality = ObservationQualityControl.validateObservation(obs, refTime);
    expect(quality.status).toBe("valid");
    expect(quality.score).toBe(1.0);
  });

  it("decays weight for observations older than 20 minutes", () => {
    const obs: Partial<WeatherObservation> = {
      stationId: "meteotrentino:T0193",
      observedAt: "2026-08-12T11:35:00.000Z", // 25 min old
      windSpeedMs: 8.5,
      windDirectionDeg: 180,
    };

    const quality = ObservationQualityControl.validateObservation(obs, refTime);
    expect(quality.status).toBe("suspect");
    expect(quality.score).toBeLessThan(0.6);
  });

  it("rejects observations older than 90 minutes", () => {
    const obs: Partial<WeatherObservation> = {
      stationId: "meteotrentino:T0193",
      observedAt: "2026-08-12T10:00:00.000Z", // 120 min old
      windSpeedMs: 8.5,
      windDirectionDeg: 180,
    };

    const quality = ObservationQualityControl.validateObservation(obs, refTime);
    expect(quality.status).toBe("missing");
    expect(quality.score).toBe(0.0);
  });

  it("rejects out-of-range wind speed values (> 60 m/s)", () => {
    const obs: Partial<WeatherObservation> = {
      stationId: "lombardia:colico",
      observedAt: "2026-08-12T11:58:00.000Z",
      windSpeedMs: 95.0, // Impossible value
    };

    const quality = ObservationQualityControl.validateObservation(obs, refTime);
    expect(quality.status).toBe("invalid");
    expect(quality.score).toBe(0.0);
  });

  it("flags suspect when gust is significantly lower than sustained wind", () => {
    const obs: Partial<WeatherObservation> = {
      stationId: "meteotrentino:T0193",
      observedAt: "2026-08-12T11:55:00.000Z",
      windSpeedMs: 15.0,
      windGustMs: 5.0, // Inconsistent
      windDirectionDeg: 180,
    };

    const quality = ObservationQualityControl.validateObservation(obs, refTime);
    expect(quality.score).toBeLessThan(1.0);
    expect(quality.reasons).toContain("GUST_LOWER_THAN_SUSTAINED_WIND");
  });
});
