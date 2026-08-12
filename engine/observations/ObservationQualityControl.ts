import { WeatherObservation, ObservationQuality, ObservationQualityStatus } from "./types";

export interface QualityLimits {
  minWindSpeedMs: number;
  maxWindSpeedMs: number;
  minGustMs: number;
  maxGustMs: number;
  minTempC: number;
  maxTempC: number;
  minHumidityPct: number;
  maxHumidityPct: number;
  minPressureHpa: number;
  maxPressureHpa: number;
  minSolarRadiation: number;
  maxSolarRadiation: number;
}

export const DEFAULT_QUALITY_LIMITS: QualityLimits = {
  minWindSpeedMs: 0,
  maxWindSpeedMs: 60,
  minGustMs: 0,
  maxGustMs: 80,
  minTempC: -40,
  maxTempC: 55,
  minHumidityPct: 0,
  maxHumidityPct: 100,
  minPressureHpa: 800,
  maxPressureHpa: 1100,
  minSolarRadiation: 0,
  maxSolarRadiation: 1500,
};

export class ObservationQualityControl {
  /**
   * Evaluates freshness factor (0.0 to 1.0) based on elapsed time since observation.
   */
  static evaluateFreshness(
    observedAt: string,
    referenceTime: Date = new Date()
  ): { ageMinutes: number; freshnessFactor: number; status: ObservationQualityStatus } {
    const obsTime = new Date(observedAt).getTime();
    const refTime = referenceTime.getTime();

    // Check for clock skew / future timestamps (allow max 2 min tolerance)
    if (obsTime > refTime + 2 * 60 * 1000) {
      const futureMinutes = Math.round(((obsTime - refTime) / (1000 * 60)) * 10) / 10;
      return { ageMinutes: -futureMinutes, freshnessFactor: 0.0, status: "invalid" };
    }

    const ageMs = Math.max(0, refTime - obsTime);
    const ageMinutes = Math.round((ageMs / (1000 * 60)) * 10) / 10;

    if (ageMinutes <= 10) {
      return { ageMinutes, freshnessFactor: 1.0, status: "valid" };
    }
    if (ageMinutes <= 20) {
      return { ageMinutes, freshnessFactor: 0.7, status: "valid" };
    }
    if (ageMinutes <= 45) {
      return { ageMinutes, freshnessFactor: 0.35, status: "suspect" };
    }
    if (ageMinutes <= 90) {
      return { ageMinutes, freshnessFactor: 0.05, status: "stale" };
    }
    return { ageMinutes, freshnessFactor: 0.0, status: "missing" };
  }

  /**
   * Performs full quality control checks on an observation.
   */
  static validateObservation(
    obs: Partial<WeatherObservation>,
    referenceTime: Date = new Date(),
    limits: QualityLimits = DEFAULT_QUALITY_LIMITS
  ): ObservationQuality {
    const reasons: string[] = [];
    let score = 1.0;

    if (!obs.observedAt) {
      return {
        status: "missing",
        score: 0.0,
        reasons: ["MISSING_TIMESTAMP"],
      };
    }

    const { ageMinutes, freshnessFactor, status: freshnessStatus } =
      this.evaluateFreshness(obs.observedAt, referenceTime);

    if (freshnessStatus === "invalid") {
      return {
        status: "invalid",
        score: 0.0,
        reasons: [`FUTURE_TIMESTAMP`],
      };
    }

    if (freshnessStatus === "missing") {
      return {
        status: "missing",
        score: 0.0,
        reasons: [`OBSERVATION_TOO_OLD_${ageMinutes}M`],
      };
    }

    if (freshnessStatus === "stale") {
      score *= 0.2;
      reasons.push(`STALE_DATA_${ageMinutes}M`);
    } else if (freshnessStatus === "suspect") {
      score *= freshnessFactor;
      reasons.push(`AGE_PENALTY_${ageMinutes}M`);
    }

    // Range Validation
    if (obs.windSpeedMs !== null && obs.windSpeedMs !== undefined) {
      if (obs.windSpeedMs < limits.minWindSpeedMs || obs.windSpeedMs > limits.maxWindSpeedMs) {
        score = 0.0;
        reasons.push(`WIND_OUT_OF_RANGE_${obs.windSpeedMs}MS`);
      }
    }

    if (obs.windGustMs !== null && obs.windGustMs !== undefined) {
      if (obs.windGustMs < limits.minGustMs || obs.windGustMs > limits.maxGustMs) {
        score = 0.0;
        reasons.push(`GUST_OUT_OF_RANGE_${obs.windGustMs}MS`);
      }
      // Internal consistency: gust significantly lower than sustained wind
      if (
        obs.windSpeedMs !== null &&
        obs.windSpeedMs !== undefined &&
        obs.windGustMs < obs.windSpeedMs * 0.8 &&
        obs.windSpeedMs > 3.0
      ) {
        score *= 0.5;
        reasons.push("GUST_LOWER_THAN_SUSTAINED_WIND");
      }
    }

    if (obs.windDirectionDeg !== null && obs.windDirectionDeg !== undefined) {
      if (obs.windDirectionDeg < 0 || obs.windDirectionDeg > 360) {
        score = 0.0;
        reasons.push(`DIRECTION_OUT_OF_RANGE_${obs.windDirectionDeg}DEG`);
      }
    }

    if (obs.temperatureC !== null && obs.temperatureC !== undefined) {
      if (obs.temperatureC < limits.minTempC || obs.temperatureC > limits.maxTempC) {
        score *= 0.5;
        reasons.push(`TEMPERATURE_OUT_OF_RANGE_${obs.temperatureC}C`);
      }
    }

    if (obs.relativeHumidityPct !== null && obs.relativeHumidityPct !== undefined) {
      if (obs.relativeHumidityPct < limits.minHumidityPct || obs.relativeHumidityPct > limits.maxHumidityPct) {
        score *= 0.7;
        reasons.push(`HUMIDITY_OUT_OF_RANGE_${obs.relativeHumidityPct}%`);
      }
    }

    if (obs.pressureHpa !== null && obs.pressureHpa !== undefined) {
      if (obs.pressureHpa < limits.minPressureHpa || obs.pressureHpa > limits.maxPressureHpa) {
        score *= 0.7;
        reasons.push(`PRESSURE_OUT_OF_RANGE_${obs.pressureHpa}HPA`);
      }
    }

    if (obs.precipitationMm !== null && obs.precipitationMm !== undefined) {
      if (obs.precipitationMm < 0) {
        score = 0.0;
        reasons.push("NEGATIVE_PRECIPITATION");
      }
    }

    let finalStatus: ObservationQualityStatus = "valid";
    if (score === 0) {
      finalStatus = "invalid";
    } else if (score < 0.6) {
      finalStatus = freshnessStatus === "stale" ? "stale" : "suspect";
    }

    return {
      status: finalStatus,
      score: Math.round(score * 100) / 100,
      reasons: reasons.length > 0 ? reasons : ["OK"],
    };
  }
}
