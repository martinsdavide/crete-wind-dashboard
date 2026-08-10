import { WindDirection, WaterState, SpotEligibility } from "./weather";
import { RiderPreferences } from "@/config/riderPreferences";

export interface QualityPoint {
  wind: number; // knots
  score: number; // 0-100 quality score
}

export interface DirectionCorrection {
  rawDirection: WindDirection;
  localDirection: WindDirection;
  speedMultiplier: number;
}

export interface HardGateRule {
  id: string;
  description: string;
  regimes?: string[];
  directionRange?: [number, number]; // [minDegrees, maxDegrees]
  minWind?: number;
  maxWind?: number;
  eligibility: SpotEligibility;
  reason: string;
}

export interface SpotLocalCorrectionConfig {
  baseCorrectionFactor: number;
  minFactor: number;
  maxFactor: number;
  summerBoostMonths?: number[]; // [6, 7, 8]
  summerBoostAmount?: number;
  diurnalThermalBoost?: {
    startHour: number; // 13
    endHour: number;   // 18
    boostAmount: number;
  };
  directionModifiers?: Partial<Record<WindDirection, number>>;
  directionDeflections?: Partial<Record<WindDirection, WindDirection>>;
}

export interface RegionSpotConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description: string;
  sweetSpotSummary: string;
  idealDirections: WindDirection[];
  idealDirectionDegrees?: [number, number];
  minPlaningWind: number; // default 11 kt
  idealWindMin: number;   // e.g. 18 kt
  idealWindMax: number;   // e.g. 26 kt
  comfortCeilingWind: number; // e.g. 30 kt
  qualityCurve: QualityPoint[];
  localCorrection: SpotLocalCorrectionConfig;
  hardGates?: HardGateRule[];
  defaultStyle: WaterState;
  preferredStyles?: Partial<Record<WaterState, number>>;
  styleRules?: {
    waveThresholdWind?: number;
    bumpAndJumpThresholdWind?: number;
    favoredDirections?: WindDirection[];
  };
}

export interface RegimeDefinition {
  id: string;
  label: string;
  description: string;
  criteria: {
    referenceSpotIds?: string[]; // IDs of spots whose raw flow defines the regional regime
    minRawWind?: number;
    maxRawWind?: number;
    directions: WindDirection[];
  };
}

export interface ExplanationTemplateRule {
  id: string;
  condition: {
    spotId?: string;
    regimeId?: string;
    minScore?: number;
    minWind?: number;
  };
  explanation: string;
}

export interface RegionMetadata {
  displayName: string;
  editionTitle: string;
  subtitle: string;
  country: string;
  defaultZoom: number;
  defaultCenter: {
    latitude: number;
    longitude: number;
  };
}

export interface RegionConfig {
  id: string;
  metadata: RegionMetadata;
  timezone: string; // e.g. "Europe/Athens", "Europe/Rome"
  spots: RegionSpotConfig[];
  regimes: RegimeDefinition[];
  defaultSpotId: string;
  explanationRules: ExplanationTemplateRule[];
  defaultRiderPreferences?: RiderPreferences;
}
