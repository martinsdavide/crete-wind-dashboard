import { SpotId, SpotConfig } from "./spot";

export type WindDirection =
  | "N"
  | "NNE"
  | "NE"
  | "ENE"
  | "E"
  | "ESE"
  | "SE"
  | "SSE"
  | "S"
  | "SSW"
  | "SW"
  | "WSW"
  | "W"
  | "WNW"
  | "NW"
  | "NNW";

export type WindClassification =
  | "LOW"
  | "LIGHT"
  | "GOOD"
  | "GREAT"
  | "STRONG"
  | "VERY STRONG";

export type ForecastConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ConditionLabel =
  | "POOR"
  | "OK"
  | "GOOD"
  | "VERY GOOD"
  | "EXCELLENT";

export type SpotEligibility =
  | "IDEAL"
  | "SUITABLE"
  | "MARGINAL"
  | "UNSUITABLE";

export type WaterState =
  | "FLAT"
  | "CHOP"
  | "BUMP_AND_JUMP"
  | "WAVE";

export type WindRegime =
  | "MELTEMI_STRONG"
  | "MELTEMI_MODERATE"
  | "MELTEMI_LIGHT"
  | "WESTERLY"
  | "SOUTHWESTERLY"
  | "OTHER";

export interface HourlyWind {
  timestamp: string; // ISO 8601 UTC string (e.g. 2026-08-09T12:00:00.000Z)

  modelWind: number; // knots
  modelGust: number; // knots

  directionDegrees: number; // 0-359
  directionLabel: WindDirection;
  arrowRotation: number; // degrees wind blows TO (deg + 180 % 360)

  localWind: number; // knots
  localGust: number; // knots

  correctionFactor: number;
  confidence: number; // 0-100
  confidenceLevel: ForecastConfidenceLevel;

  // Domain V2: Eligibility, Water State & Session Quality
  eligibility: SpotEligibility;
  waterState: WaterState;
  spotWindQuality: number; // 0-100 (spot specific non-monotonic quality)
  directionQuality: number; // 0-100
  preferenceScore: number; // 0-100 (wave bonus, comfort limit)
  sessionQualityScore: number; // 0-100 (primary recommendation score)

  score: number; // legacy alias mapped to sessionQualityScore
  windScore?: number; // legacy generic wind score

  classification: WindClassification;
  condition: ConditionLabel;

  temperature?: number; // °C
  cloudCover?: number; // %
}

export interface BestWindow {
  start: string; // e.g. "14:00" in Europe/Athens
  end: string;   // e.g. "18:00" in Europe/Athens
  startIso?: string;
  endIso?: string;
  durationHours: number;
  minWind: number;
  maxWind: number;
  dominantDirection: WindDirection;
  meanScore: number; // session quality mean
  sailingStyle: WaterState;
  condition: ConditionLabel;
}

export interface DailyWindSummary {
  date: string; // YYYY-MM-DD in Europe/Athens

  minWind: number;
  maxWind: number;

  daytimeMinWind: number;
  daytimeMaxWind: number;

  maxGust: number;

  dominantDirection: WindDirection;
  dominantDirectionDegrees: number;

  bestWindow?: BestWindow | null;

  score: number; // daily spot score (average of top 3 eligible hourly session quality scores)
  condition: ConditionLabel;
  dominantEligibility: SpotEligibility;
  dominantStyle: WaterState;
}

export interface WindSpot extends SpotConfig {}

export interface SpotForecast {
  spot: WindSpot;
  current: HourlyWind;
  hourly: HourlyWind[];
  days: DailyWindSummary[];
  providerModel: string;
}

export type SpotResult =
  | {
      status: "ok";
      data: SpotForecast;
    }
  | {
      status: "error";
      message: string;
      spot: WindSpot;
    };

export interface Recommendation {
  bestSpot: SpotId | null;
  bestSpotName: string | null;
  bestWindow: BestWindow | null;
  score: number | null; // Top session quality score
  dayScoreKouremenos: number | null;
  dayScoreTenda: number | null;
  dayScoreXerokampos: number | null;
  regime: WindRegime;
  regimeLabel: string;
  sailingStyle: WaterState;
  explanation: string[];
}

export interface WindApiResponse {
  generatedAt: string; // ISO timestamp
  model: string;
  timezone: string; // "Europe/Athens"
  spots: {
    kouremenos: SpotResult;
    tenda: SpotResult;
    xerokampos: SpotResult;
  };
  recommendation: Recommendation;
}
