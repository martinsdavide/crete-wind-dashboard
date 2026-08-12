import {
  WeatherObservation,
  SpotStationBinding,
  ObservationFusionResult,
  StationContribution,
} from "./types";
import { StationRegistry } from "./StationRegistry";
import { ObservationFeatureExtractor } from "./ObservationFeatureExtractor";
import { ObservationQualityControl } from "./ObservationQualityControl";
import { msToKnots } from "./ObservationNormalizer";

export class ObservationFusionEngine {
  /**
   * Maximum short-term wind speed correction in knots (~3.0 m/s = 5.8 kt)
   */
  static readonly MAX_SPEED_CORRECTION_KT = 5.8;

  /**
   * Evaluates and applies live observation fusion to a spot's forecast.
   */
  static fuseSpotForecast(
    spotId: string,
    bindings: SpotStationBinding[] | undefined,
    observations: Record<string, WeatherObservation | null>,
    forecastModelSpeedKt: number,
    forecastModelGustKt: number,
    forecastModelDirDeg: number,
    referenceTime: Date = new Date(),
    forecastHorizonHours = 0
  ): ObservationFusionResult {
    const reasons: string[] = [];

    // Fallback neutral result if no bindings exist
    if (!bindings || bindings.length === 0) {
      return {
        status: "unavailable",
        observationCoverage: 0,
        latestObservedAt: null,
        correctedWindSpeedKt: forecastModelSpeedKt,
        correctedWindGustKt: forecastModelGustKt,
        correctedWindDirectionDeg: forecastModelDirDeg,
        speedCorrectionKt: 0,
        directionCorrectionDeg: 0,
        timingCorrectionMinutes: 0,
        confidenceAdjustment: 0,
        regimeEvidence: {
          thermal: 0.5,
          northerly: 0.5,
          disturbance: 0.0,
          transition: 0.0,
          rainBoost: 0.0,
        },
        contributors: [],
        reasons: ["NO_STATION_BINDINGS"],
      };
    }

    const features = ObservationFeatureExtractor.extractFeatures(
      bindings,
      observations,
      forecastModelSpeedKt,
      forecastModelDirDeg,
      referenceTime
    );

    const contributors: StationContribution[] = [];
    let latestObsTime: string | null = null;
    let validStationCount = 0;

    for (const binding of bindings) {
      const obs = observations[binding.stationId];
      if (!obs) continue;

      const station = StationRegistry.getStation(binding.stationId);
      const stationName = station?.name || binding.stationId;

      const { ageMinutes } = ObservationQualityControl.evaluateFreshness(
        obs.observedAt,
        referenceTime
      );

      if (obs.quality.status === "valid" || obs.quality.status === "suspect") {
        validStationCount++;
        if (!latestObsTime || new Date(obs.observedAt).getTime() > new Date(latestObsTime).getTime()) {
          latestObsTime = obs.observedAt;
        }
      }

      contributors.push({
        stationId: binding.stationId,
        stationName,
        role: binding.role,
        weight: Math.round(binding.baseWeight * obs.quality.score * 100) / 100,
        observedWindKt: msToKnots(obs.windSpeedMs),
        observedGustKt: msToKnots(obs.windGustMs),
        observedDirectionDeg: obs.windDirectionDeg,
        observedAt: obs.observedAt,
        ageMinutes,
        qualityScore: obs.quality.score,
        effectsApplied: binding.allowedEffects,
      });
    }

    // Determine status
    let status: "available" | "partial" | "stale" | "unavailable" | "conflicting" = "unavailable";
    if (validStationCount === 0) {
      status = contributors.length > 0 ? "stale" : "unavailable";
    } else if (features.observationCoverage >= 0.5) {
      status = "available";
    } else {
      status = "partial";
    }

    // Calculate horizon decay factor for live speed correction
    // 0h: 1.0, 1h: 0.60, 2h: 0.25, 3h: 0.10, >3h: 0.0
    let horizonFactor = 0.0;
    if (forecastHorizonHours <= 0.25) {
      horizonFactor = 1.0;
    } else if (forecastHorizonHours <= 1.0) {
      horizonFactor = 0.60;
    } else if (forecastHorizonHours <= 2.0) {
      horizonFactor = 0.25;
    } else if (forecastHorizonHours <= 3.0) {
      horizonFactor = 0.10;
    }

    let speedCorrectionKt = 0;
    let correctedWindSpeedKt = forecastModelSpeedKt;
    let correctedWindGustKt = forecastModelGustKt;
    let directionCorrectionDeg: number | null = null;
    let correctedWindDirectionDeg = forecastModelDirDeg;
    let confidenceAdjustment = 0;
    let timingCorrectionMinutes = 0;

    if (features.speedBiasKt !== null && features.observationCoverage > 0.2) {
      // Check if spot has any binding allowing speed-bias
      const allowsSpeedBias = bindings.some((b) => b.allowedEffects.includes("speed-bias"));

      if (allowsSpeedBias) {
        // Cap raw bias
        const rawCorrection = features.speedBiasKt * features.observationCoverage * horizonFactor * 0.5;
        speedCorrectionKt = Math.max(
          -this.MAX_SPEED_CORRECTION_KT,
          Math.min(this.MAX_SPEED_CORRECTION_KT, rawCorrection)
        );
        speedCorrectionKt = Math.round(speedCorrectionKt * 10) / 10;
        correctedWindSpeedKt = Math.max(0, Math.round((forecastModelSpeedKt + speedCorrectionKt) * 10) / 10);
        correctedWindGustKt = Math.max(
          correctedWindSpeedKt,
          Math.round((forecastModelGustKt + speedCorrectionKt) * 10) / 10
        );

        if (speedCorrectionKt > 1.5) {
          reasons.push("OBSERVED_WIND_ABOVE_FORECAST");
        } else if (speedCorrectionKt < -1.5) {
          reasons.push("OBSERVED_WIND_BELOW_FORECAST");
        }
      }

      // Confidence Tuning
      if (Math.abs(features.speedBiasKt) <= 2.5 && (features.directionErrorDeg === null || Math.abs(features.directionErrorDeg) <= 30)) {
        confidenceAdjustment += 0.08 * features.observationCoverage;
        reasons.push("OBSERVATION_FORECAST_AGREEMENT");
      } else if (Math.abs(features.speedBiasKt) > 6.0) {
        confidenceAdjustment -= 0.10 * features.observationCoverage;
        reasons.push("OBSERVATION_SPEED_DISCREPANCY");
      }

      if (features.directionErrorDeg !== null && Math.abs(features.directionErrorDeg) > 50) {
        confidenceAdjustment -= 0.12 * features.observationCoverage;
        reasons.push("STATION_DIRECTION_MISMATCH");
      }

      // Regime / Thermal Confirmation
      if (features.thermalSupportEvidence >= 0.70) {
        reasons.push("THERMAL_ONSET_CONFIRMED");
        confidenceAdjustment += 0.05;
        timingCorrectionMinutes = 15;
      } else if (features.northerlySupportEvidence >= 0.70) {
        reasons.push("NORTHERLY_FLOW_CONFIRMED");
        confidenceAdjustment += 0.05;
      }
    }

    if (features.rainOvernightMm >= 1.0) {
      reasons.push(`OVERNIGHT_RAIN_${features.rainOvernightMm}MM`);
    }

    confidenceAdjustment = Math.max(-0.20, Math.min(0.20, Math.round(confidenceAdjustment * 100) / 100));

    return {
      status,
      observationCoverage: features.observationCoverage,
      latestObservedAt: latestObsTime,
      correctedWindSpeedKt,
      correctedWindGustKt,
      correctedWindDirectionDeg,
      speedCorrectionKt,
      directionCorrectionDeg,
      timingCorrectionMinutes,
      confidenceAdjustment,
      regimeEvidence: {
        thermal: features.thermalSupportEvidence,
        northerly: features.northerlySupportEvidence,
        disturbance: 0.0,
        transition: 0.0,
        rainBoost: features.rainBoostEvidence,
      },
      contributors,
      reasons: reasons.length > 0 ? reasons : ["OBSERVATIONS_STANDBY"],
    };
  }
}
