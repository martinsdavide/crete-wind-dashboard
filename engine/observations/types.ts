import { WindDirection } from "@/types/weather";

export type StationRole =
  | "spot-local"
  | "lake-upwind"
  | "valley"
  | "mountain"
  | "gradient"
  | "precipitation-context"
  | "validation-only";

export type ObservationParameter =
  | "wind_speed"
  | "wind_direction"
  | "wind_gust"
  | "temperature"
  | "humidity"
  | "pressure"
  | "precipitation"
  | "solar_radiation";

export interface WeatherStation {
  id: string; // Namespaced e.g. "lombardia:colico", "meteotrentino:T0193"
  provider: string;
  providerStationId: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone: string; // e.g. "Europe/Rome"
  status: "active" | "inactive" | "unknown";
  roles: StationRole[];
  capabilities: ObservationParameter[];
  attribution?: string;
  sourceUrl: string;
}

export type ObservationQualityStatus =
  | "valid"
  | "suspect"
  | "invalid"
  | "stale"
  | "missing";

export interface ObservationQuality {
  status: ObservationQualityStatus;
  score: number; // 0.0 to 1.0
  reasons: string[];
}

export interface WeatherObservation {
  stationId: string;
  observedAt: string; // ISO 8601 UTC
  receivedAt: string; // ISO 8601 UTC
  windSpeedMs: number | null;
  windGustMs: number | null;
  windDirectionDeg: number | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  pressureHpa: number | null;
  precipitationMm: number | null;
  solarRadiationWm2: number | null;
  quality: ObservationQuality;
  rawReference?: string;
}

export interface SpotStationBinding {
  stationId: string;
  role: StationRole;
  baseWeight: number; // 0.0 to 1.0
  maxAgeMinutes: number;
  compatibleDirections?: {
    fromDeg: number;
    toDeg: number;
  }[];
  parameters: ObservationParameter[];
  allowedEffects: Array<
    | "current-condition"
    | "timing-correction"
    | "speed-bias"
    | "confidence"
    | "rain-context"
    | "thermal-context"
    | "regime-detection"
  >;
}

export interface StationContribution {
  stationId: string;
  stationName: string;
  role: StationRole;
  weight: number;
  observedWindKt: number | null;
  observedGustKt: number | null;
  observedDirectionDeg: number | null;
  observedAt: string;
  ageMinutes: number;
  qualityScore: number;
  effectsApplied: string[];
}

export interface ObservationFusionResult {
  status: "available" | "partial" | "stale" | "unavailable" | "conflicting";
  observationCoverage: number; // 0.0 to 1.0
  latestObservedAt: string | null;
  correctedWindSpeedKt: number;
  correctedWindGustKt: number;
  correctedWindDirectionDeg: number | null;
  speedCorrectionKt: number;
  directionCorrectionDeg: number | null;
  timingCorrectionMinutes: number;
  confidenceAdjustment: number; // e.g. -0.15 to +0.15
  regimeEvidence: {
    thermal: number; // 0.0 to 1.0
    northerly: number;
    disturbance: number;
    transition: number;
    rainBoost: number;
  };
  contributors: StationContribution[];
  reasons: string[];
  evidenceTypes?: string[];
}
