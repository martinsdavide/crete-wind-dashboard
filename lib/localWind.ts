import { SPOT_PROFILES } from "@/config/windProfiles";
import { degreesToCompass } from "./windDirection";
import { WindDirection } from "@/types/weather";

/**
 * Returns Athens local month (1-12), day of month (1-31), and fractional hour (0.0-24.0)
 * from a timestamp string or Date object.
 */
export function getAthensTimeComponents(timestamp: string | Date): {
  month: number;
  day: number;
  hour: number;
} {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  
  if (isNaN(date.getTime())) {
    return { month: 1, day: 1, hour: 12 };
  }

  // Format in Europe/Athens timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Athens",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let month = 1;
  let day = 1;
  let hour = 12;
  let minute = 0;

  for (const part of parts) {
    if (part.type === "month") month = parseInt(part.value, 10);
    if (part.type === "day") day = parseInt(part.value, 10);
    if (part.type === "hour") hour = parseInt(part.value, 10);
    if (part.type === "minute") minute = parseInt(part.value, 10);
  }

  // If 24 returned by formatToParts (midnight edge case), normalize to 0
  if (hour === 24) hour = 0;

  const fractionalHour = hour + minute / 60;
  return { month, day, hour: fractionalHour };
}

/**
 * Checks if a given Athens date falls within the Kouremenos thermal season (15 May to 30 September).
 */
export function isWithinThermalSeason(
  month: number,
  day: number,
  startMonth = 5,
  startDay = 15,
  endMonth = 9,
  endDay = 30
): boolean {
  if (month < startMonth || month > endMonth) return false;
  if (month === startMonth && day < startDay) return false;
  if (month === endMonth && day > endDay) return false;
  return true;
}

/**
 * Interpolates the Kouremenos thermal factor for a given hour of the day (0.0 - 24.0).
 */
export function calculateThermalFactor(
  hour: number,
  dailyProfile = SPOT_PROFILES.kouremenos.thermalDailyProfile || []
): number {
  if (hour < 8 || hour > 20 || dailyProfile.length === 0) {
    return 1.00;
  }

  // Exact matches
  for (const point of dailyProfile) {
    if (Math.abs(point.hour - hour) < 0.001) {
      return point.factor;
    }
  }

  // Interpolation between adjacent points
  for (let i = 0; i < dailyProfile.length - 1; i++) {
    const p1 = dailyProfile[i];
    const p2 = dailyProfile[i + 1];

    if (hour >= p1.hour && hour <= p2.hour) {
      const fraction = (hour - p1.hour) / (p2.hour - p1.hour);
      return p1.factor + fraction * (p2.factor - p1.factor);
    }
  }

  return 1.00;
}

/**
 * Calculates cloud attenuation factor for thermal effect.
 * Cloud cover reduces ONLY the thermal component.
 */
export function calculateCloudAttenuation(
  cloudCover: number,
  tiers = SPOT_PROFILES.kouremenos.cloudAttenuation || []
): number {
  const cover = Math.max(0, Math.min(100, isNaN(cloudCover) ? 0 : cloudCover));
  for (const tier of tiers) {
    if (cover < tier.maxCover) {
      return tier.factor;
    }
  }
  return 0.15; // default fallback for 100%
}

export interface LocalWindResult {
  localWind: number;
  correctionFactor: number;
  directionFactor: number;
  thermalFactor: number;
  cloudAttenuation: number;
  directionLabel: WindDirection;
}

/**
 * Pure calculation function for Spot-specific Local Wind correction.
 */
export function calculateLocalWind(
  spotId: "kouremenos" | "tenda",
  modelWind: number,
  directionDegrees: number,
  timestamp: string | Date,
  cloudCover: number = 0
): LocalWindResult {
  const safeModelWind = Math.max(0, isNaN(modelWind) ? 0 : modelWind);
  const profile = SPOT_PROFILES[spotId];
  const directionLabel = degreesToCompass(directionDegrees);

  const directionFactor =
    profile.directionFactors[directionLabel] ?? profile.directionFactors.default;

  let thermalFactor = 1.00;
  let cloudAttenuation = 1.00;
  let correctionFactor = 1.00;

  if (spotId === "kouremenos" && profile.applyThermal) {
    const { month, day, hour } = getAthensTimeComponents(timestamp);
    const inSeason = isWithinThermalSeason(
      month,
      day,
      profile.thermalSeasonStartMonth,
      profile.thermalSeasonStartDay,
      profile.thermalSeasonEndMonth,
      profile.thermalSeasonEndDay
    );

    if (inSeason) {
      thermalFactor = calculateThermalFactor(hour, profile.thermalDailyProfile);
      cloudAttenuation = calculateCloudAttenuation(cloudCover, profile.cloudAttenuation);
    }

    const directionBoost = directionFactor - 1;
    const thermalBoost = thermalFactor - 1;
    const adjustedThermalBoost = thermalBoost * cloudAttenuation;

    correctionFactor = 1 + directionBoost + adjustedThermalBoost;
  } else {
    // Tenda or thermal disabled
    correctionFactor = directionFactor;
  }

  // Clamping to spot bounds
  correctionFactor = Math.max(
    profile.minCorrectionFactor,
    Math.min(profile.maxCorrectionFactor, correctionFactor)
  );

  const localWind = safeModelWind * correctionFactor;

  return {
    localWind,
    correctionFactor,
    directionFactor,
    thermalFactor,
    cloudAttenuation,
    directionLabel,
  };
}

/**
 * Calculates local gust estimate based on specification:
 * localGust = modelGust + ((localWind - modelWind) * 0.60)
 * Safeguards: localGust >= localWind, no negative or NaN values.
 */
export function calculateLocalGust(
  modelGust: number,
  localWind: number,
  modelWind: number,
  gustAdjustmentFactor = 0.60
): number {
  const safeModelWind = Math.max(0, isNaN(modelWind) ? 0 : modelWind);
  const safeLocalWind = Math.max(0, isNaN(localWind) ? safeModelWind : localWind);
  
  // If modelGust is missing or invalid, default to max(safeModelWind, safeLocalWind)
  const safeModelGust = isNaN(modelGust) || modelGust < safeModelWind
    ? safeModelWind
    : modelGust;

  const windDelta = safeLocalWind - safeModelWind;
  const calculatedGust = safeModelGust + windDelta * gustAdjustmentFactor;

  // Guarantee localGust >= localWind and localGust >= 0
  return Math.max(safeLocalWind, calculatedGust, 0);
}
