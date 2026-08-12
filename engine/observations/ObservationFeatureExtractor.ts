import { WeatherObservation, SpotStationBinding } from "./types";
import { msToKnots } from "./ObservationNormalizer";

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
   * Computes vector circular mean for a collection of weighted wind observations.
   */
  static calculateCircularVectorMean(
    samples: { speed: number; directionDeg: number; weight: number }[]
  ): { meanSpeed: number; meanDirectionDeg: number } | null {
    if (!samples || samples.length === 0) return null;

    let sinSum = 0;
    let cosSum = 0;
    let totalWeight = 0;
    let weightedSpeedSum = 0;

    for (const sample of samples) {
      if (sample.weight <= 0) continue;
      const rad = (sample.directionDeg * Math.PI) / 180;
      sinSum += sample.weight * Math.sin(rad);
      cosSum += sample.weight * Math.cos(rad);
      weightedSpeedSum += sample.weight * sample.speed;
      totalWeight += sample.weight;
    }

    if (totalWeight <= 0) return null;

    const meanDirectionDeg = (Math.atan2(sinSum, cosSum) * (180 / Math.PI) + 360) % 360;
    const meanSpeed = weightedSpeedSum / totalWeight;

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
    forecastModelDirDeg: number
  ): ExtractedObservationFeatures {
    const windSamples: { speed: number; directionDeg: number; weight: number }[] = [];
    const gustSamples: { gust: number; weight: number }[] = [];

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

      // Compute effective weight based on quality and freshness
      let effectiveWeight = binding.baseWeight * obs.quality.score;

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
            // Crossing 0 degrees (e.g. 340 to 40)
            return obs.windDirectionDeg! >= range.fromDeg || obs.windDirectionDeg! <= range.toDeg;
          }
        });
        if (!isCompatible) {
          effectiveWeight *= 0.4;
        }
      }

      totalTrustedWeight += effectiveWeight;

      if (obs.windSpeedMs !== null && obs.windDirectionDeg !== null) {
        const speedKt = msToKnots(obs.windSpeedMs)!;
        windSamples.push({
          speed: speedKt,
          directionDeg: obs.windDirectionDeg,
          weight: effectiveWeight,
        });
      }

      if (obs.windGustMs !== null) {
        const gustKt = msToKnots(obs.windGustMs)!;
        gustSamples.push({ gust: gustKt, weight: effectiveWeight });
      }

      if (obs.precipitationMm !== null && obs.precipitationMm > 0) {
        recentPrecipitation1hMm += obs.precipitationMm;
        rainOvernightMm += obs.precipitationMm;
      }

      // Evidence updates based on station role
      if (binding.role === "spot-local" || binding.role === "lake-upwind") {
        if (obs.windDirectionDeg !== null) {
          // Southerly sector (140-230) supports thermal Ora / Breva
          if (obs.windDirectionDeg >= 140 && obs.windDirectionDeg <= 230) {
            thermalSupportEvidence = Math.min(1.0, thermalSupportEvidence + 0.3 * effectiveWeight);
            northerlySupportEvidence = Math.max(0.0, northerlySupportEvidence - 0.3 * effectiveWeight);
          }
          // Northerly sector (330-40) supports Pelèr / Tivano
          else if (obs.windDirectionDeg >= 330 || obs.windDirectionDeg <= 40) {
            northerlySupportEvidence = Math.min(1.0, northerlySupportEvidence + 0.3 * effectiveWeight);
            thermalSupportEvidence = Math.max(0.0, thermalSupportEvidence - 0.3 * effectiveWeight);
          }
        }
      }
    }

    const coverage = maxConfiguredWeight > 0 ? Math.min(1.0, totalTrustedWeight / maxConfiguredWeight) : 0;

    let weightedWindSpeedKt: number | null = null;
    let circularMeanDirectionDeg: number | null = null;

    if (windSamples.length > 0) {
      const vectorRes = this.calculateCircularVectorMean(windSamples);
      if (vectorRes) {
        weightedWindSpeedKt = vectorRes.meanSpeed;
        circularMeanDirectionDeg = vectorRes.meanDirectionDeg;
      }
    }

    let weightedWindGustKt: number | null = null;
    if (gustSamples.length > 0) {
      const sum = gustSamples.reduce((a, b) => a + b.gust * b.weight, 0);
      const wSum = gustSamples.reduce((a, b) => a + b.weight, 0);
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
    };
  }
}
