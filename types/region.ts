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

export type ThermalBoostModel = "FIXED" | "DYNAMIC";

export interface FixedThermalBoostConfig {
  model?: "FIXED";
  enabled?: boolean;
  startHour: number; // 13
  endHour: number;   // 18
  boostAmount: number; // 0.15
}

export interface DynamicThermalBoostConfig {
  model: "DYNAMIC";
  enabled?: boolean;
  maxBoost: number; // e.g. 0.20
  monthFactors?: Record<number, number>; // 1-12 -> 0-1
  timeProfile?: { hour: number; factor: number }[]; // [{ hour: 11, factor: 0.10 }, ...]
  directionFactors?: Partial<Record<WindDirection, number>>;
  defaultDirectionFactor?: number;
  synopticWindCurve?: { wind: number; factor: number }[]; // [{ wind: 0, factor: 0.20 }, ...]
  cloudCoverCurve?: { cloud: number; factor: number }[]; // [{ cloud: 0, factor: 1.0 }, ...]
  minThermalStrength?: number;
}

export type DiurnalThermalBoostConfig = FixedThermalBoostConfig | DynamicThermalBoostConfig;

export interface ThermalEvaluation {
  strength: number; // 0-1
  boost: number;    // increment to correction factor
  active: boolean;
  factors: {
    season: number;
    time: number;
    direction: number;
    synopticWind: number;
    solar: number;
  };
}

export interface SpotLocalCorrectionConfig {
  baseCorrectionFactor: number;
  minFactor: number;
  maxFactor: number;
  summerBoostMonths?: number[]; // [6, 7, 8]
  summerBoostAmount?: number;
  diurnalThermalBoost?: DiurnalThermalBoostConfig;
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
  directionScores?: Partial<Record<WindDirection, number>> & { default?: number };
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
    directions?: WindDirection[];
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
