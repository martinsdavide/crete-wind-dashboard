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

export interface HourlyWind {
  timestamp: string; // ISO 8601 string or YYYY-MM-DDTHH:mm in Europe/Athens

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

  score: number; // 0-100
  classification: WindClassification;
  condition: ConditionLabel;

  temperature?: number; // °C
  cloudCover?: number; // %
}

export interface BestWindow {
  start: string; // e.g. "14:00"
  end: string;   // e.g. "18:00"
  startIso?: string;
  endIso?: string;
  durationHours: number;
  minWind: number;
  maxWind: number;
  dominantDirection: WindDirection;
  meanScore: number;
  condition: ConditionLabel;
}

export interface DailyWindSummary {
  date: string; // YYYY-MM-DD

  minWind: number;
  maxWind: number;

  maxGust: number;

  dominantDirection: WindDirection;
  dominantDirectionDegrees: number;

  bestWindow?: BestWindow | null;

  score: number; // daily spot score (average of top 3 hourly daytime scores)
  condition: ConditionLabel;
}

export interface WindSpot {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  localCorrectionEnabled: boolean;
}

export interface SpotForecast {
  spot: WindSpot;
  current: HourlyWind;
  hourly: HourlyWind[];
  days: DailyWindSummary[];
}

export interface Recommendation {
  bestSpot: string | null; // spot ID e.g. 'kouremenos' or 'tenda'
  bestSpotName: string | null;
  bestWindow: BestWindow | null;
  score: number | null;
  dayScoreKouremenos: number;
  dayScoreTenda: number;
}

export interface WindApiResponse {
  generatedAt: string; // ISO timestamp
  model: string; // e.g. "ECMWF IFS (Open-Meteo)"
  timezone: string; // "Europe/Athens"
  spots: {
    kouremenos: SpotForecast;
    tenda: SpotForecast;
  };
  recommendation: Recommendation;
}
