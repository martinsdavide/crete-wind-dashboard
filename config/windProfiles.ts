import { SpotCorrectionProfile } from "@/types/spot";

export const KOUREMENOS_PROFILE: SpotCorrectionProfile = {
  directionFactors: {
    N: 1.10,
    NNW: 1.15,
    NW: 1.25,
    WNW: 1.20,
    W: 1.05,
    default: 1.00,
  },
  applyThermal: true,
  thermalSeasonStartMonth: 5, // May
  thermalSeasonStartDay: 15,
  thermalSeasonEndMonth: 9,   // September
  thermalSeasonEndDay: 30,
  thermalDailyProfile: [
    { hour: 8, factor: 1.00 },
    { hour: 10, factor: 1.03 },
    { hour: 12, factor: 1.08 },
    { hour: 14, factor: 1.12 },
    { hour: 16, factor: 1.15 },
    { hour: 18, factor: 1.08 },
    { hour: 20, factor: 1.00 },
  ],
  cloudAttenuation: [
    { maxCover: 30, factor: 1.00 },
    { maxCover: 60, factor: 0.75 },
    { maxCover: 80, factor: 0.40 },
    { maxCover: 100, factor: 0.15 },
  ],
  minCorrectionFactor: 0.90,
  maxCorrectionFactor: 1.45,
  gustAdjustmentFactor: 0.60,
  directionScores: {
    NW: 100,
    NNW: 95,
    WNW: 90,
    N: 80,
    W: 65,
    default: 40,
  },
};

export const TENDA_PROFILE: SpotCorrectionProfile = {
  directionFactors: {
    N: 1.05,
    NNW: 1.10,
    NW: 1.10,
    WNW: 1.05,
    default: 1.00,
  },
  applyThermal: false,
  minCorrectionFactor: 0.90,
  maxCorrectionFactor: 1.20,
  gustAdjustmentFactor: 0.60,
  directionScores: {
    NW: 100,
    NNW: 100,
    N: 90,
    WNW: 85,
    default: 40,
  },
};

export const XEROKAMPOS_PROFILE: SpotCorrectionProfile = {
  directionFactors: {
    WSW: 1.15,
    SW: 1.10,
    W: 1.10,
    SSW: 1.05,
    default: 1.00,
  },
  applyThermal: false,
  minCorrectionFactor: 0.90,
  maxCorrectionFactor: 1.25,
  gustAdjustmentFactor: 0.60,
  directionScores: {
    WSW: 100,
    SW: 100,
    W: 90,
    SSW: 80,
    default: 30,
  },
};

export const SPOT_PROFILES: Record<"kouremenos" | "tenda" | "xerokampos", SpotCorrectionProfile> = {
  kouremenos: KOUREMENOS_PROFILE,
  tenda: TENDA_PROFILE,
  xerokampos: XEROKAMPOS_PROFILE,
};

export const SCORING_CONFIG = {
  weights: {
    windStrength: 0.55,
    direction: 0.25,
    gustiness: 0.10,
    confidence: 0.10,
  },
  sessionWeights: {
    spotWindQuality: 0.35,
    directionQuality: 0.20,
    waterStateQuality: 0.15,
    personalPreference: 0.15,
    gustQuality: 0.10,
    confidence: 0.05,
  },
  windStrengthThresholds: [
    { wind: 0, score: 0 },
    { wind: 12, score: 20 },
    { wind: 15, score: 50 },
    { wind: 18, score: 80 },
    { wind: 22, score: 100 },
    { wind: 28, score: 90 },
    { wind: 32, score: 70 },
    { wind: 36, score: 40 },
  ],
  gustinessTiers: [
    { maxRatio: 1.20, score: 100 },
    { maxRatio: 1.30, score: 90 },
    { maxRatio: 1.45, score: 70 },
    { maxRatio: Infinity, score: 40 },
  ],
  confidence: {
    baseline: 80,
    horizonUnder24h: 5,
    horizonOver48h: -10,
    horizonOver72h: -15,
    favorableDirection: 5,
    nonTypicalDirection: -10,
    windOver15kt: 5,
    windUnder10kt: -10,
  },
  bestWindow: {
    minScoreThreshold: 70,
    minConsecutiveHours: 2,
  },
  daytime: {
    startHour: 9,
    endHour: 20,
  },
  timezone: "Europe/Athens",
};
