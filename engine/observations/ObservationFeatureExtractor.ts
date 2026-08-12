import { WeatherObservation, SpotStationBinding } from "./types";
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
  rainOvernightMm: number;
  recentPrecipitation1hMm: number;
  thermalSupportEvidence: number; // 0.0 to 1.0
  northerlySupportEvidence: number; // 0.0 to 1.0
  rainBoostEvidence: number; // 0.0 to 1.0
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
    referenceTime: Date = new Date()
  ): ExtractedObservationFeatures {
    const directWindSamples: { speed: number; directionDeg: number; weight: number }[] = [];
    const directGustSamples: { gust: number; weight: number }[] = [];

    let totalTrustedWeight = 0;
    let maxConfiguredWeight = 0;
    let rainOvernightMm = 0;
    let recentPrecipitation1hMm = 0;
    let thermalSupportEvidence = 0.5;
    let northerlySupportEvidence = 0.5;

    for (const binding of bindings) {
      maxConfiguredWeight += binding.baseWeight;
      const obs = observations[binding.stationId];
      if (!obs || obs.quality.status === "invalid" || obs.quality.status === "missing") {
        continue;
      }

      // Check per-binding maxAgeMinutes
      const { ageMinutes, freshnessFactor } = ObservationQualityControl.evaluateFreshness(
        obs.observedAt,
        referenceTime
      );

      if (ageMinutes > binding.maxAgeMinutes || freshnessFactor <= 0) {
        continue; // Stale beyond binding limit
      }

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

      // Direct Wind Speed/Gust Correction: strictly require allowedEffects to include "speed-bias" or "current-condition"
      const allowsSpeedBias =
        binding.allowedEffects.includes("speed-bias") ||
        binding.allowedEffects.includes("current-condition");

      if (allowsSpeedBias && obs.windSpeedMs !== null && obs.windDirectionDeg !== null) {
        const speedKt = msToKnots(obs.windSpeedMs)!;
        directWindSamples.push({
          speed: speedKt,
          directionDeg: obs.windDirectionDeg,
          weight: effectiveWeight,
        });
      }

      if (allowsSpeedBias && obs.windGustMs !== null) {
        const gustKt = msToKnots(obs.windGustMs)!;
        directGustSamples.push({ gust: gustKt, weight: effectiveWeight });
      }

      if (binding.allowedEffects.includes("rain-context") && obs.precipitationMm !== null && obs.precipitationMm > 0) {
        recentPrecipitation1hMm += obs.precipitationMm;
        rainOvernightMm += obs.precipitationMm;
      }

      // Regime & Context Evidence
      if (binding.allowedEffects.includes("regime-detection") || binding.allowedEffects.includes("thermal-context")) {
        if (obs.windDirectionDeg !== null) {
          // Southerly sector (140-230) supports thermal Ora / Breva
          if (obs.windDirectionDeg >= 140 && obs.windDirectionDeg <= 230) {
            thermalSupportEvidence = Math.min(1.0, thermalSupportEvidence + 0.35 * effectiveWeight);
            northerlySupportEvidence = Math.max(0.0, northerlySupportEvidence - 0.35 * effectiveWeight);
          }
          // Northerly sector (330-40) supports Pelèr / Tivano / North
          else if (obs.windDirectionDeg >= 330 || obs.windDirectionDeg <= 40) {
            northerlySupportEvidence = Math.min(1.0, northerlySupportEvidence + 0.35 * effectiveWeight);
            thermalSupportEvidence = Math.max(0.0, thermalSupportEvidence - 0.35 * effectiveWeight);
          }
        }
      }
    }

    const coverage = maxConfiguredWeight > 0 ? Math.min(1.0, totalTrustedWeight / maxConfiguredWeight) : 0;

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

    // Calculate Valmadrera Rain Boost evidence: requires overnight rain + northerly morning direction
    let rainBoostEvidence = 0.0;
    if (rainOvernightMm >= 1.0 && (forecastModelDirDeg >= 330 || forecastModelDirDeg <= 50)) {
      rainBoostEvidence = Math.min(1.0, 0.4 + (rainOvernightMm / 10.0) * 0.6);
    }

    return {
      weightedWindSpeedKt,
      weightedWindGustKt,
      circularMeanDirectionDeg,
      speedBiasKt,
      directionErrorDeg,
      totalTrustedWeight,
      maxConfiguredWeight,
      observationCoverage: Math.round(coverage * 100) / 100,
      rainOvernightMm: Math.round(rainOvernightMm * 10) / 10,
      recentPrecipitation1hMm: Math.round(recentPrecipitation1hMm * 10) / 10,
      thermalSupportEvidence: Math.round(thermalSupportEvidence * 100) / 100,
      northerlySupportEvidence: Math.round(northerlySupportEvidence * 100) / 100,
      rainBoostEvidence: Math.round(rainBoostEvidence * 100) / 100,
    };
  }
}
