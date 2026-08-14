import { WeatherObservation, SpotStationBinding, ObservationCoverageBreakdown, isBindingConfigured } from "./types";
import { msToKnots } from "./ObservationNormalizer";
import { ObservationQualityControl } from "./ObservationQualityControl";

export interface ExtractedObservationFeatures {
  weightedWindSpeedKt: number | null;
  weightedWindGustKt: number | null;
  circularMeanDirectionDeg: number | null;
  speedBiasKt: number | null;
  directionErrorDeg: number | null;
  totalTrustedWeight: number;
  maxConfiguredWeight: number;
  observationCoverage: number;
  coverage: ObservationCoverageBreakdown;
  rainOvernightMm: number;
  recentPrecipitation1hMm: number;
  thermalSupportEvidence: number; // 0.0 to 1.0
  northerlySupportEvidence: number; // 0.0 to 1.0
  rainBoostEvidence: number; // 0.0 to 1.0
  hasSpeedConflict?: boolean;
  hasDirectionConflict?: boolean;
}

export class ObservationFeatureExtractor {
  /**
   * Calculates circular angular difference in [-180, 180] degrees.
   */
  static angularDifference(a: number, b: number): number {
    let diff = (a - b + 180) % 360 - 180;
    if (diff < -180) diff += 360;
    return diff;
  }

  /**
   * Computes true meteorological vector average (u, v decomposition) for weighted wind observations.
   * u = -s * sin(theta), v = -s * cos(theta)
   */
  static calculateMeteorologicalVectorMean(
    samples: { speed: number; directionDeg: number; weight: number }[]
  ): { meanSpeed: number; meanDirectionDeg: number } | null {
    if (!samples || samples.length === 0) return null;

    let uSum = 0;
    let vSum = 0;
    let totalWeight = 0;

    for (const sample of samples) {
      if (sample.weight <= 0) continue;
      const rad = (sample.directionDeg * Math.PI) / 180;
      // Meteorological convention: wind from direction theta has components
      // u (eastward) = -speed * sin(theta)
      // v (northward) = -speed * cos(theta)
      const u = -sample.speed * Math.sin(rad);
      const v = -sample.speed * Math.cos(rad);

      uSum += sample.weight * u;
      vSum += sample.weight * v;
      totalWeight += sample.weight;
    }

    if (totalWeight <= 0) return null;

    const uMean = uSum / totalWeight;
    const vMean = vSum / totalWeight;

    // Vector magnitude (resultant speed)
    const meanSpeed = Math.sqrt(uMean * uMean + vMean * vMean);

    // Resultant meteorological direction (direction from which the wind blows)
    const meanDirectionDeg = (Math.atan2(-uMean, -vMean) * (180 / Math.PI) + 360) % 360;

    return {
      meanSpeed: Math.round(meanSpeed * 10) / 10,
      meanDirectionDeg: Math.round(meanDirectionDeg),
    };
  }

  /**
   * Extracts fused meteorological features for a given spot and its bound stations.
   */
  static extractFeatures(
    bindings: SpotStationBinding[],
    observations: Record<string, WeatherObservation | null>,
    forecastModelSpeedKt: number,
    forecastModelDirDeg: number,
    referenceTime: Date = new Date(),
    evidenceProfiles?: import("@/types/region").ObservationEvidenceProfile[]
  ): ExtractedObservationFeatures & { evidenceMap?: Record<string, number>; evidenceTypes?: string[] } {
    const directWindSamples: { speed: number; directionDeg: number; weight: number }[] = [];
    const directGustSamples: { gust: number; weight: number }[] = [];
    const activeObservations: WeatherObservation[] = [];

    let totalTrustedWeight = 0;
    let maxConfiguredWeight = 0;

    // Category tracking for parameter-specific coverage
    const catMaxWeight = {
      windSpeed: 0,
      windGust: 0,
      windDirection: 0,
      currentCondition: 0,
      regimeDetection: 0,
      thermalContext: 0,
      rainContext: 0,
      confidence: 0,
    };
    const catTrustedWeight = {
      windSpeed: 0,
      windGust: 0,
      windDirection: 0,
      currentCondition: 0,
      regimeDetection: 0,
      thermalContext: 0,
      rainContext: 0,
      confidence: 0,
    };

    let rainOvernightMm = 0;
    let recentPrecipitation1hMm = 0;
    let thermalSupportEvidence = 0.5;
    let northerlySupportEvidence = 0.5;
    let rainBoostEvidence = 0.0;

    for (const binding of bindings) {
      if (!isBindingConfigured(binding)) {
        continue;
      }
      maxConfiguredWeight += binding.baseWeight;

      const allowsWind =
        binding.allowedEffects.includes("speed-bias") ||
        binding.allowedEffects.includes("current-condition");

      if (allowsWind && binding.parameters.includes("wind_speed")) catMaxWeight.windSpeed += binding.baseWeight;
      if (allowsWind && binding.parameters.includes("wind_gust")) catMaxWeight.windGust += binding.baseWeight;
      if (allowsWind && binding.parameters.includes("wind_direction")) catMaxWeight.windDirection += binding.baseWeight;
      if (binding.allowedEffects.includes("current-condition")) catMaxWeight.currentCondition += binding.baseWeight;
      if (binding.allowedEffects.includes("regime-detection")) catMaxWeight.regimeDetection += binding.baseWeight;
      if (binding.allowedEffects.includes("thermal-context")) catMaxWeight.thermalContext += binding.baseWeight;
      if (binding.allowedEffects.includes("rain-context")) catMaxWeight.rainContext += binding.baseWeight;
      if (binding.allowedEffects.includes("confidence")) catMaxWeight.confidence += binding.baseWeight;

      const obs = observations[binding.stationId];
      if (!obs || obs.quality.status === "invalid" || obs.quality.status === "missing") {
        continue;
      }

      // Check per-binding maxAgeMinutes and delayed policy
      const freshUntil = binding.maxAgeMinutes;
      const delayedUntil = binding.delayedUseUntilMinutes ?? 90;
      const delayedPolicy = binding.delayedUsePolicy ?? "NONE";

      const { ageMinutes, freshnessFactor } = ObservationQualityControl.evaluateFreshness(
        obs.observedAt,
        referenceTime,
        freshUntil,
        delayedUntil,
        delayedPolicy
      );

      if (freshnessFactor <= 0) {
        continue; // Stale beyond configured policy limit
      }

      activeObservations.push(obs);

      // Effective weight
      let effectiveWeight = binding.baseWeight * obs.quality.score * freshnessFactor;

      // Direction compatibility filter if configured
      if (
        binding.compatibleDirections &&
        obs.windDirectionDeg !== null &&
        binding.compatibleDirections.length > 0
      ) {
        const isCompatible = binding.compatibleDirections.some((range) => {
          if (range.fromDeg <= range.toDeg) {
            return obs.windDirectionDeg! >= range.fromDeg && obs.windDirectionDeg! <= range.toDeg;
          } else {
            // Crossing 0 degrees (e.g. 330 to 45)
            return obs.windDirectionDeg! >= range.fromDeg || obs.windDirectionDeg! <= range.toDeg;
          }
        });
        if (!isCompatible) {
          effectiveWeight *= 0.3;
        }
      }

      totalTrustedWeight += effectiveWeight;

      // Populate parameter trusted weights
      if (allowsWind && binding.parameters.includes("wind_speed") && obs.windSpeedMs !== null) {
        catTrustedWeight.windSpeed += effectiveWeight;
      }
      if (allowsWind && binding.parameters.includes("wind_gust") && obs.windGustMs !== null) {
        catTrustedWeight.windGust += effectiveWeight;
      }
      if (allowsWind && binding.parameters.includes("wind_direction") && obs.windDirectionDeg !== null) {
        catTrustedWeight.windDirection += effectiveWeight;
      }
      if (binding.allowedEffects.includes("current-condition")) catTrustedWeight.currentCondition += effectiveWeight;
      if (binding.allowedEffects.includes("regime-detection")) catTrustedWeight.regimeDetection += effectiveWeight;
      if (binding.allowedEffects.includes("thermal-context")) catTrustedWeight.thermalContext += effectiveWeight;
      if (binding.allowedEffects.includes("rain-context")) catTrustedWeight.rainContext += effectiveWeight;
      if (binding.allowedEffects.includes("confidence")) catTrustedWeight.confidence += effectiveWeight;

      // Direct Wind Speed/Gust Correction: strictly require allowedEffects to include "speed-bias" or "current-condition"
      if (allowsWind && obs.windSpeedMs !== null && obs.windDirectionDeg !== null) {
        const speedKt = msToKnots(obs.windSpeedMs)!;
        directWindSamples.push({
          speed: speedKt,
          directionDeg: obs.windDirectionDeg,
          weight: effectiveWeight,
        });
      }

      if (allowsWind && obs.windGustMs !== null) {
        const gustKt = msToKnots(obs.windGustMs)!;
        directGustSamples.push({ gust: gustKt, weight: effectiveWeight });
      }

      if (binding.allowedEffects.includes("rain-context") && obs.precipitationMm !== null && obs.precipitationMm > 0) {
        recentPrecipitation1hMm += obs.precipitationMm;
        rainOvernightMm += obs.precipitationMm;
      }
    }

    const overallCoverage = maxConfiguredWeight > 0 ? Math.min(1.0, totalTrustedWeight / maxConfiguredWeight) : 0;

    const calcCatCov = (trusted: number, maxW: number) =>
      maxW > 0 ? Math.round(Math.min(1.0, trusted / maxW) * 100) / 100 : 0;

    const coverageBreakdown: ObservationCoverageBreakdown = {
      overall: Math.round(overallCoverage * 100) / 100,
      windSpeed: calcCatCov(catTrustedWeight.windSpeed, catMaxWeight.windSpeed),
      windGust: calcCatCov(catTrustedWeight.windGust, catMaxWeight.windGust),
      windDirection: calcCatCov(catTrustedWeight.windDirection, catMaxWeight.windDirection),
      currentCondition: calcCatCov(catTrustedWeight.currentCondition, catMaxWeight.currentCondition),
      regimeDetection: calcCatCov(catTrustedWeight.regimeDetection, catMaxWeight.regimeDetection),
      thermalContext: calcCatCov(catTrustedWeight.thermalContext, catMaxWeight.thermalContext),
      rainContext: calcCatCov(catTrustedWeight.rainContext, catMaxWeight.rainContext),
      confidence: calcCatCov(catTrustedWeight.confidence, catMaxWeight.confidence),
    };

    let weightedWindSpeedKt: number | null = null;
    let circularMeanDirectionDeg: number | null = null;

    if (directWindSamples.length > 0) {
      const vectorRes = this.calculateMeteorologicalVectorMean(directWindSamples);
      if (vectorRes) {
        weightedWindSpeedKt = vectorRes.meanSpeed;
        circularMeanDirectionDeg = vectorRes.meanDirectionDeg;
      }
    }

    let weightedWindGustKt: number | null = null;
    if (directGustSamples.length > 0) {
      const sum = directGustSamples.reduce((a, b) => a + b.gust * b.weight, 0);
      const wSum = directGustSamples.reduce((a, b) => a + b.weight, 0);
      weightedWindGustKt = wSum > 0 ? Math.round((sum / wSum) * 10) / 10 : null;
    }

    const speedBiasKt =
      weightedWindSpeedKt !== null
        ? Math.round((weightedWindSpeedKt - forecastModelSpeedKt) * 10) / 10
        : null;

    const directionErrorDeg =
      circularMeanDirectionDeg !== null
        ? Math.round(this.angularDifference(circularMeanDirectionDeg, forecastModelDirDeg))
        : null;

    // Evaluate evidence profiles
    const evidenceMap: Record<string, number> = {};
    const evidenceTypes: string[] = [];

    if (evidenceProfiles && evidenceProfiles.length > 0) {
      const { getLocalTimeComponents } = require("@/lib/localWind");
      const { hour } = getLocalTimeComponents(referenceTime, "Europe/Rome");

      for (const profile of evidenceProfiles) {
        let score = 0.5; // Neutral starting point
        let hasValidStation = false;

        if (profile.localTimeWindow) {
          if (hour < profile.localTimeWindow.startHour || hour > profile.localTimeWindow.endHour) {
            evidenceMap[profile.id] = 0.0;
            continue;
          }
        }

        for (const binding of bindings) {
          const obs = observations[binding.stationId];
          if (!obs || obs.quality.status === "invalid" || obs.quality.status === "missing") {
            continue;
          }

          if (profile.requiredStationRoles && !profile.requiredStationRoles.includes(binding.role)) {
            continue;
          }

          const { ageMinutes, freshnessFactor } = ObservationQualityControl.evaluateFreshness(
            obs.observedAt,
            referenceTime
          );
          if (ageMinutes > binding.maxAgeMinutes || freshnessFactor <= 0) {
            continue;
          }

          const effectiveWeight = binding.baseWeight * obs.quality.score * freshnessFactor;

          if (obs.windDirectionDeg !== null && profile.directionSectors.length > 0) {
            const matchesDir = profile.directionSectors.some((range) => {
              if (range.fromDeg <= range.toDeg) {
                return obs.windDirectionDeg! >= range.fromDeg && obs.windDirectionDeg! <= range.toDeg;
              } else {
                return obs.windDirectionDeg! >= range.fromDeg || obs.windDirectionDeg! <= range.toDeg;
              }
            });

            if (matchesDir) {
              hasValidStation = true;
              score = Math.min(1.0, score + 0.35 * effectiveWeight);
            } else {
              score = Math.max(0.0, score - 0.35 * effectiveWeight);
            }
          }
        }

        const finalScore = hasValidStation ? Math.round(score * 100) / 100 : 0.5;
        evidenceMap[profile.id] = finalScore;

        if (finalScore >= 0.70) {
          evidenceTypes.push(profile.evidenceType);
        }
      }

      // Map back to legacy fields for backward compatibility
      const thermalProf = Object.entries(evidenceMap).find(([id]) => {
        const prof = evidenceProfiles.find((p) => p.id === id);
        return prof?.evidenceType === "THERMAL_SUPPORT";
      });
      if (thermalProf) {
        thermalSupportEvidence = thermalProf[1];
      }

      const northerlyProf = Object.entries(evidenceMap).find(([id]) => {
        const prof = evidenceProfiles.find((p) => p.id === id);
        return (
          prof?.id.includes("north") ||
          prof?.id.includes("peler") ||
          prof?.id.includes("tivano") ||
          prof?.id.includes("synoptic")
        );
      });
      if (northerlyProf) {
        northerlySupportEvidence = northerlyProf[1];
      }

      const rainProf = Object.entries(evidenceMap).find(([id]) => {
        const prof = evidenceProfiles.find((p) => p.id === id);
        return prof?.evidenceType === "POST_RAIN_SUPPORT";
      });
      if (rainProf) {
        rainBoostEvidence = rainProf[1];
      }
    } else {
      // Legacy hardcoded fallback logic
      for (const binding of bindings) {
        const obs = observations[binding.stationId];
        if (!obs) continue;
        if (binding.allowedEffects.includes("regime-detection") || binding.allowedEffects.includes("thermal-context")) {
          if (obs.windDirectionDeg !== null) {
            const { ageMinutes, freshnessFactor } = ObservationQualityControl.evaluateFreshness(
              obs.observedAt,
              referenceTime
            );
            if (ageMinutes <= binding.maxAgeMinutes && freshnessFactor > 0) {
              const effectiveWeight = binding.baseWeight * obs.quality.score * freshnessFactor;
              if (obs.windDirectionDeg >= 140 && obs.windDirectionDeg <= 230) {
                thermalSupportEvidence = Math.min(1.0, thermalSupportEvidence + 0.35 * effectiveWeight);
                northerlySupportEvidence = Math.max(0.0, northerlySupportEvidence - 0.35 * effectiveWeight);
              } else if (obs.windDirectionDeg >= 330 || obs.windDirectionDeg <= 40) {
                northerlySupportEvidence = Math.min(1.0, northerlySupportEvidence + 0.35 * effectiveWeight);
                thermalSupportEvidence = Math.max(0.0, thermalSupportEvidence - 0.35 * effectiveWeight);
              }
            }
          }
        }
      }

      if (rainOvernightMm >= 1.0 && (forecastModelDirDeg >= 330 || forecastModelDirDeg <= 50)) {
        rainBoostEvidence = Math.min(1.0, 0.4 + (rainOvernightMm / 10.0) * 0.6);
      }
    }

    let hasDirectionConflict = false;
    let hasSpeedConflict = false;
    for (let i = 0; i < activeObservations.length; i++) {
      for (let j = i + 1; j < activeObservations.length; j++) {
        const obsA = activeObservations[i];
        const obsB = activeObservations[j];
        if (obsA.windSpeedMs !== null && obsB.windSpeedMs !== null) {
          const speedA = msToKnots(obsA.windSpeedMs)!;
          const speedB = msToKnots(obsB.windSpeedMs)!;
          if (Math.abs(speedA - speedB) > 8.0) {
            hasSpeedConflict = true;
          }
        }
        if (obsA.windDirectionDeg !== null && obsB.windDirectionDeg !== null) {
          const diff = Math.abs(this.angularDifference(obsA.windDirectionDeg, obsB.windDirectionDeg));
          if (diff > 60) {
            hasDirectionConflict = true;
          }
        }
      }
    }

    return {
      weightedWindSpeedKt,
      weightedWindGustKt,
      circularMeanDirectionDeg,
      speedBiasKt,
      directionErrorDeg,
      totalTrustedWeight,
      maxConfiguredWeight,
      observationCoverage: coverageBreakdown.overall,
      coverage: coverageBreakdown,
      rainOvernightMm: Math.round(rainOvernightMm * 10) / 10,
      recentPrecipitation1hMm: Math.round(recentPrecipitation1hMm * 10) / 10,
      thermalSupportEvidence: Math.round(thermalSupportEvidence * 100) / 100,
      northerlySupportEvidence: Math.round(northerlySupportEvidence * 100) / 100,
      rainBoostEvidence: Math.round(rainBoostEvidence * 100) / 100,
      hasSpeedConflict,
      hasDirectionConflict,
      evidenceMap,
      evidenceTypes,
    };
  }
}
