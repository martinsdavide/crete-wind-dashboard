import {
  WeatherObservation,
  SpotStationBinding,
  ObservationFusionResult,
  ObservationCoverageBreakdown,
  StationContribution,
  isBindingConfigured,
} from "./types";
import { StationRegistry } from "./StationRegistry";
import { ObservationFeatureExtractor } from "./ObservationFeatureExtractor";
import { ObservationQualityControl } from "./ObservationQualityControl";
import { msToKnots } from "./ObservationNormalizer";

import { ObservationLogger } from "./ObservationLogger";

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
    forecastHorizonHours = 0,
    regionId = "unknown",
    requestId?: string
  ): ObservationFusionResult {
    const reasons: string[] = [];

    // Fallback neutral result if no bindings exist
    if (!bindings || bindings.length === 0) {
      const emptyCoverage: ObservationCoverageBreakdown = {
        overall: 0,
        windSpeed: 0,
        windGust: 0,
        windDirection: 0,
        currentCondition: 0,
        regimeDetection: 0,
        thermalContext: 0,
        rainContext: 0,
        confidence: 0,
      };
      return {
        status: "unavailable",
        observationCoverage: 0,
        coverage: emptyCoverage,
        windFusionStatus: "unavailable",
        contextFusionStatus: "unavailable",
        windObservationUsed: false,
        directionObservationUsed: false,
        regimeObservationUsed: false,
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

    let evidenceProfiles: any[] = [];
    if (regionId && regionId !== "unknown") {
      try {
        const { getRegion } = require("@/regions/registry");
        const regionConfig = getRegion(regionId);
        if (regionConfig && regionConfig.observationEvidenceProfiles) {
          evidenceProfiles = regionConfig.observationEvidenceProfiles;
        }
      } catch (e) {
        console.warn("Could not load regionConfig for evidence extraction:", e);
      }
    }

    const features = ObservationFeatureExtractor.extractFeatures(
      bindings,
      observations,
      forecastModelSpeedKt,
      forecastModelDirDeg,
      referenceTime,
      evidenceProfiles
    );

    const contributors: StationContribution[] = [];
    let latestObsTime: string | null = null;
    let validStationCount = 0;
    let hasDelayedWindContributor = false;
    let hasFreshWindContributor = false;

    for (const binding of bindings) {
      if (!isBindingConfigured(binding)) continue;
      const obs = observations[binding.stationId];
      if (!obs) continue;

      const station = StationRegistry.getStation(binding.stationId);
      const stationName = station?.name || binding.stationId;

      const freshUntil = binding.maxAgeMinutes;
      const delayedUntil = binding.delayedUseUntilMinutes ?? 90;
      const delayedPolicy = binding.delayedUsePolicy ?? "NONE";

      const { ageMinutes, freshnessFactor, freshnessCategory } = ObservationQualityControl.evaluateFreshness(
        obs.observedAt,
        referenceTime,
        freshUntil,
        delayedUntil,
        delayedPolicy
      );

      if (obs.quality.status === "valid" || obs.quality.status === "suspect") {
        validStationCount++;
        if (!latestObsTime || new Date(obs.observedAt).getTime() > new Date(latestObsTime).getTime()) {
          latestObsTime = obs.observedAt;
        }
      }

      const allowsWind =
        binding.allowedEffects.includes("speed-bias") ||
        binding.allowedEffects.includes("current-condition");

      if (allowsWind && obs.windSpeedMs !== null) {
        if (freshnessCategory === "FRESH") hasFreshWindContributor = true;
        if (freshnessCategory === "DELAYED" && delayedPolicy === "DECAYED_PERSISTENCE") {
          hasDelayedWindContributor = true;
        }
      }

      contributors.push({
        stationId: binding.stationId,
        stationName,
        role: binding.role,
        weight: Math.round(binding.baseWeight * obs.quality.score * freshnessFactor * 100) / 100,
        observedWindKt: msToKnots(obs.windSpeedMs),
        observedGustKt: msToKnots(obs.windGustMs),
        observedDirectionDeg: obs.windDirectionDeg,
        observedAt: obs.observedAt,
        ageMinutes,
        qualityScore: obs.quality.score,
        effectsApplied: binding.allowedEffects,
      });
    }

    // Determine parameter-specific statuses
    let windFusionStatus: "available" | "degraded" | "stale" | "unavailable" = "unavailable";
    if (features.coverage.windSpeed >= 0.5 && hasFreshWindContributor) {
      windFusionStatus = "available";
    } else if (features.coverage.windSpeed > 0 && (hasFreshWindContributor || hasDelayedWindContributor)) {
      windFusionStatus = hasDelayedWindContributor ? "degraded" : "available";
    } else if (bindings.some((b) => b.allowedEffects.includes("speed-bias") || b.allowedEffects.includes("current-condition"))) {
      windFusionStatus = contributors.length > 0 ? "stale" : "unavailable";
    }

    let contextFusionStatus: "available" | "partial" | "unavailable" = "unavailable";
    if (features.coverage.thermalContext >= 0.5 || features.coverage.rainContext >= 0.5 || features.coverage.overall >= 0.5) {
      contextFusionStatus = "available";
    } else if (features.coverage.overall > 0) {
      contextFusionStatus = "partial";
    }

    // Overall status
    let status: "available" | "partial" | "stale" | "unavailable" | "conflicting" = "unavailable";
    if (validStationCount === 0) {
      status = contributors.length > 0 ? "stale" : "unavailable";
    } else if (windFusionStatus === "available" || contextFusionStatus === "available") {
      status = "available";
    } else {
      status = "partial";
    }

    // Calculate horizon decay factor for live speed correction
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
    let windObservationUsed = false;
    let directionObservationUsed = false;
    let regimeObservationUsed = false;

    // Direct Wind Correction Branch: requires wind-specific coverage > 0
    if (features.coverage.windSpeed > 0 && features.weightedWindSpeedKt !== null) {
      const allowsSpeedBias = bindings.some((b) => b.allowedEffects.includes("speed-bias"));
      const allowsCurrentCondition = bindings.some((b) => b.allowedEffects.includes("current-condition"));

      if (allowsSpeedBias || allowsCurrentCondition) {
        windObservationUsed = true;

        // Model / observation blending using effective weight
        const effectiveWeight = Math.min(0.95, features.coverage.windSpeed * horizonFactor);

        const blendedSpeed = forecastModelSpeedKt * (1 - effectiveWeight) + features.weightedWindSpeedKt * effectiveWeight;
        correctedWindSpeedKt = Math.max(0, Math.round(blendedSpeed * 10) / 10);

        speedCorrectionKt = Math.round((correctedWindSpeedKt - forecastModelSpeedKt) * 10) / 10;

        if (features.weightedWindGustKt !== null) {
          const blendedGust = forecastModelGustKt * (1 - effectiveWeight) + features.weightedWindGustKt * effectiveWeight;
          correctedWindGustKt = Math.max(correctedWindSpeedKt, Math.round(blendedGust * 10) / 10);
        } else {
          correctedWindGustKt = Math.max(correctedWindSpeedKt, forecastModelGustKt);
        }

        if (hasFreshWindContributor) {
          reasons.push("FRESH_LOCAL_WIND_APPLIED");
        } else if (hasDelayedWindContributor) {
          reasons.push("DELAYED_LOCAL_WIND_APPLIED");
        }

        if (speedCorrectionKt > 1.5) {
          reasons.push("OBSERVED_WIND_ABOVE_FORECAST");
        } else if (speedCorrectionKt < -1.5) {
          reasons.push("OBSERVED_WIND_BELOW_FORECAST");
        }
      }

      // Direction correction with tiered thresholds (30°/45° cap)
      if (features.circularMeanDirectionDeg !== null && allowsCurrentCondition) {
        directionObservationUsed = true;
        if (features.directionErrorDeg !== null) {
          const absErr = Math.abs(features.directionErrorDeg);
          if (absErr <= 30) {
            directionCorrectionDeg = Math.round(features.directionErrorDeg);
            correctedWindDirectionDeg = (forecastModelDirDeg + directionCorrectionDeg + 360) % 360;
          } else if (absErr <= 45) {
            directionCorrectionDeg = null;
            confidenceAdjustment -= 0.08 * features.coverage.windDirection;
            reasons.push("STATION_DIRECTION_MISMATCH");
          } else {
            directionCorrectionDeg = null;
            confidenceAdjustment -= 0.12 * features.coverage.windDirection;
            reasons.push("STATION_DIRECTION_MISMATCH");
          }
        }
      }

      // Confidence Tuning
      if (features.speedBiasKt !== null && Math.abs(features.speedBiasKt) <= 2.5 && (features.directionErrorDeg === null || Math.abs(features.directionErrorDeg) <= 30)) {
        confidenceAdjustment += 0.08 * features.coverage.windSpeed;
        reasons.push("OBSERVATION_FORECAST_AGREEMENT");
      } else if (features.speedBiasKt !== null && Math.abs(features.speedBiasKt) > 6.0) {
        confidenceAdjustment -= 0.10 * features.coverage.windSpeed;
        reasons.push("OBSERVATION_SPEED_DISCREPANCY");
      }

      if (features.hasSpeedConflict || features.hasDirectionConflict) {
        confidenceAdjustment -= 0.15 * features.coverage.overall;
        reasons.push("OBSERVATION_SPEED_DISCREPANCY");
      }
    } else {
      if (contributors.length > 0) {
        if (features.coverage.windSpeed === 0) {
          reasons.push("CONTEXT_ONLY_OBSERVATIONS");
        } else {
          reasons.push("WIND_OBSERVATION_TOO_OLD");
        }
      }
    }

    if (features.coverage.regimeDetection > 0) {
      regimeObservationUsed = true;
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

    if (features.rainOvernightMm >= 1.0) {
      reasons.push(`OVERNIGHT_RAIN_${features.rainOvernightMm}MM`);
    }

    confidenceAdjustment = Math.max(-0.20, Math.min(0.20, Math.round(confidenceAdjustment * 100) / 100));

    const result: ObservationFusionResult = {
      status,
      observationCoverage: features.observationCoverage,
      coverage: features.coverage,
      windFusionStatus,
      contextFusionStatus,
      windObservationUsed,
      directionObservationUsed,
      regimeObservationUsed,
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
      evidenceTypes: features.evidenceTypes,
    };

    if (requestId) {
      const activeContributors = contributors
        .filter((c) => c.qualityScore > 0)
        .map((c) => c.stationId);
      ObservationLogger.logFusion(
        regionId,
        spotId,
        status,
        activeContributors,
        features.observationCoverage,
        forecastModelSpeedKt,
        correctedWindSpeedKt,
        speedCorrectionKt,
        confidenceAdjustment,
        requestId
      );
    }

    return result;
  }
}
