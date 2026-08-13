import { RegionSpotConfig, ThermalEvaluation } from "@/types/region";
import { WindDirection } from "@/types/weather";
import { getLocalTimeComponents } from "@/lib/localWind";
import { interpolateCurve } from "./ForecastNormalizer";

export class ThermalEffectEvaluator {
  /**
   * Evaluates dynamic thermal circulation strength, state, confidence, and boosts.
   */
  static evaluate(
    spotConfig: RegionSpotConfig,
    timestamp: string | Date,
    directionLabel: WindDirection,
    modelWind = 12,
    cloudCover = 0,
    timeZone = "Europe/Rome",
    solarRadiation?: number
  ): ThermalEvaluation {
    const cfg = spotConfig.localCorrection.diurnalThermalBoost;

    // Fallback if thermal boost not configured
    if (!cfg || cfg.enabled === false) {
      return {
        strength: 0,
        boost: 0,
        active: false,
        factors: { season: 1, time: 0, direction: 1, synopticWind: 1, solar: 1 },
        state: "ABSENT",
        confidence: 0,
        correctionMode: "MULTIPLICATIVE",
        additiveBoostKt: 0,
        multiplicativeBoost: 0,
        contributingFactors: [],
        limitingFactors: ["THERMAL_DISABLED"],
      };
    }

    const { month, hour } = getLocalTimeComponents(timestamp, timeZone);

    // FIXED model (Backward Compatibility)
    if (!("model" in cfg) || cfg.model !== "DYNAMIC") {
      const isHourActive = hour >= cfg.startHour && hour <= cfg.endHour;
      const strength = isHourActive ? 1.0 : 0.0;
      const boost = isHourActive ? cfg.boostAmount : 0.0;
      return {
        strength,
        boost,
        active: isHourActive,
        factors: { season: 1, time: isHourActive ? 1 : 0, direction: 1, synopticWind: 1, solar: 1 },
        state: isHourActive ? "ACTIVE" : "ABSENT",
        confidence: 1.0,
        correctionMode: "MULTIPLICATIVE",
        additiveBoostKt: 0,
        multiplicativeBoost: boost,
        contributingFactors: isHourActive ? ["TIME_SUPPORT"] : [],
        limitingFactors: isHourActive ? [] : ["TIME_WINDOW_CLOSED"],
      };
    }

    const contributingFactors: string[] = [];
    const limitingFactors: string[] = [];
    let confidence = 1.0;

    // 1. Season Factor
    let seasonFactor = 1.0;
    if (cfg.monthFactors) {
      seasonFactor = cfg.monthFactors[month] ?? 0.0;
      if (seasonFactor >= 0.8) {
        contributingFactors.push("THERMAL_SEASON_SUPPORT");
      } else if (seasonFactor <= 0.2) {
        limitingFactors.push("THERMAL_SEASON_LIMITATION");
      }
    }

    // 2. Time-of-Day Profile
    let timeFactor = 0.0;
    let peakHour = 14;
    if (cfg.timeProfile && cfg.timeProfile.length > 0) {
      const firstH = cfg.timeProfile[0].hour;
      const lastH = cfg.timeProfile[cfg.timeProfile.length - 1].hour;
      
      // Find peak hour
      let maxVal = -1;
      for (const p of cfg.timeProfile) {
        if (p.factor > maxVal) {
          maxVal = p.factor;
          peakHour = p.hour;
        }
      }

      if (hour >= firstH && hour <= lastH) {
        timeFactor = interpolateCurve(
          hour,
          cfg.timeProfile.map((p) => ({ x: p.hour, y: p.factor }))
        );
        if (timeFactor >= 0.8) {
          contributingFactors.push("THERMAL_TIME_SUPPORT");
        }
      } else {
        timeFactor = 0.0;
        limitingFactors.push("TIME_WINDOW_CLOSED");
      }
    } else {
      timeFactor = 1.0;
    }

    // 3. Direction Factor
    let directionFactor = 1.0;
    if (cfg.directionFactors) {
      directionFactor = cfg.directionFactors[directionLabel] ?? cfg.defaultDirectionFactor ?? 0.10;
      if (directionFactor >= 0.8) {
        contributingFactors.push("THERMAL_DIRECTION_SUPPORT");
      } else {
        limitingFactors.push("THERMAL_DIRECTION_LIMITATION");
      }
    }

    // 4. Synoptic Wind Factor
    let synopticWindFactor = 1.0;
    if (cfg.synopticWindCurve && cfg.synopticWindCurve.length > 0) {
      synopticWindFactor = interpolateCurve(
        modelWind,
        cfg.synopticWindCurve.map((p) => ({ x: p.wind, y: p.factor }))
      );
      if (synopticWindFactor >= 0.8) {
        contributingFactors.push("THERMAL_SYNOPTIC_SUPPORT");
      } else if (synopticWindFactor <= 0.3) {
        limitingFactors.push("THERMAL_SYNOPTIC_SUPPRESSION");
        if (synopticWindFactor > 0.0) {
          confidence -= 0.15; // penalize near incompatibility threshold
        }
      }
    }

    // 5. Cloud Cover / Solar Radiation Factor
    let solarFactor = 1.0;
    const effectiveCloud = cloudCover !== undefined && !isNaN(cloudCover) ? cloudCover : 0;
    if (cfg.cloudCoverCurve && cfg.cloudCoverCurve.length > 0) {
      solarFactor = interpolateCurve(
        effectiveCloud,
        cfg.cloudCoverCurve.map((p) => ({ x: p.cloud, y: p.factor }))
      );
    } else {
      solarFactor = Math.max(0, 1.0 - effectiveCloud / 100);
    }

    if (solarFactor >= 0.8) {
      contributingFactors.push("THERMAL_SOLAR_SUPPORT");
    } else if (solarFactor <= 0.3) {
      limitingFactors.push("THERMAL_CLOUD_SUPPRESSION");
    }

    // Solar Radiation curve check (if configured and available)
    if ("solarRadiationCurve" in cfg && cfg.solarRadiationCurve && cfg.solarRadiationCurve.length > 0) {
      if (solarRadiation !== undefined && !isNaN(solarRadiation)) {
        const radFactor = interpolateCurve(
          solarRadiation,
          cfg.solarRadiationCurve.map((p: any) => ({ x: p.solar, y: p.factor }))
        );
        solarFactor = Math.min(solarFactor, radFactor);
      } else {
        confidence -= 0.15; // reduce confidence if solar is configured but missing
      }
    }

    // Calculate final strength
    const rawStrength = seasonFactor * timeFactor * directionFactor * synopticWindFactor * solarFactor;
    let strength = Math.max(0, Math.min(1.0, rawStrength));

    const minStrength = cfg.minThermalStrength ?? 0.05;
    if (strength < minStrength) {
      strength = 0;
    }

    // Determine state
    let state: "ABSENT" | "BUILDING" | "ACTIVE" | "DECAYING" | "UNKNOWN" = "ABSENT";
    if (strength > 0) {
      if (hour < peakHour) {
        state = "BUILDING";
      } else if (Math.abs(hour - peakHour) <= 1.5 || timeFactor >= 0.85) {
        state = "ACTIVE";
      } else {
        state = "DECAYING";
      }
    }

    // Determine correction mode and boosts
    const mode = (cfg as any).correctionMode || "MULTIPLICATIVE";
    let boost = 0;
    let additiveBoostKt = 0;
    let multiplicativeBoost = 0;

    const maxMult = (cfg as any).maxMultiplicativeBoost || cfg.maxBoost || 0;
    const maxAdd = (cfg as any).maxAdditiveBoostKt || 0;

    if (mode === "MULTIPLICATIVE") {
      boost = maxMult * strength;
      multiplicativeBoost = boost;
    } else if (mode === "ADDITIVE") {
      additiveBoostKt = maxAdd * strength;
    } else if (mode === "HYBRID") {
      boost = maxMult * strength;
      multiplicativeBoost = boost;
      additiveBoostKt = maxAdd * strength;
    }

    const minConf = (cfg as any).minimumConfidenceForCorrection ?? 0.30;
    if (confidence < minConf) {
      boost = 0;
      additiveBoostKt = 0;
      multiplicativeBoost = 0;
      limitingFactors.push("LOW_CONFIDENCE_SUPPRESSION");
    }

    return {
      strength: Math.round(strength * 100) / 100,
      boost,
      active: strength > 0 && (boost > 0 || additiveBoostKt > 0),
      factors: {
        season: Math.round(seasonFactor * 100) / 100,
        time: Math.round(timeFactor * 100) / 100,
        direction: Math.round(directionFactor * 100) / 100,
        synopticWind: Math.round(synopticWindFactor * 100) / 100,
        solar: Math.round(solarFactor * 100) / 100,
      },
      state,
      confidence: Math.round(confidence * 100) / 100,
      correctionMode: mode,
      additiveBoostKt: Math.round(additiveBoostKt * 10) / 10,
      multiplicativeBoost: Math.round(multiplicativeBoost * 100) / 100,
      contributingFactors,
      limitingFactors,
    };
  }
}
