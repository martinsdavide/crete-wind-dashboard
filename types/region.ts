import { WindDirection, WaterState, SpotEligibility } from "./weather";
import { RiderPreferences } from "@/config/riderPreferences";
import { SpotSeaProfile } from "./marine";

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
  // Marine Hard Gate criteria
  minWaveHeight?: number; // min required wave height (m)
  maxWaveHeight?: number; // max allowable wave height (m)
  minWavePeriod?: number; // min allowable wave period (s)
  waveDirectionRange?: [number, number]; // hazardous wave direction range
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
  maxBoost?: number; // e.g. 0.20
  monthFactors?: Record<number, number>; // 1-12 -> 0-1
  timeProfile?: { hour: number; factor: number }[]; // [{ hour: 11, factor: 0.10 }, ...]
  directionFactors?: Partial<Record<WindDirection, number>>;
  defaultDirectionFactor?: number;
  synopticWindCurve?: { wind: number; factor: number }[]; // [{ wind: 0, factor: 0.20 }, ...]
  cloudCoverCurve?: { cloud: number; factor: number }[]; // [{ cloud: 0, factor: 1.0 }, ...]
  solarRadiationCurve?: { solar: number; factor: number }[]; // [{ solar: 0, factor: 1.0 }, ...]
  minThermalStrength?: number;
  correctionMode?: "MULTIPLICATIVE" | "ADDITIVE" | "HYBRID";
  maxMultiplicativeBoost?: number;
  maxAdditiveBoostKt?: number;
  minimumConfidenceForCorrection?: number;
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
  state?: "ABSENT" | "BUILDING" | "ACTIVE" | "DECAYING" | "UNKNOWN";
  confidence?: number;
  correctionMode?: "MULTIPLICATIVE" | "ADDITIVE" | "HYBRID";
  additiveBoostKt?: number;
  multiplicativeBoost?: number;
  contributingFactors?: string[];
  limitingFactors?: string[];
}

export interface OperatingWindow {
  mode: "SOLAR" | "SOLAR_WITH_TWILIGHT" | "FIXED";
  preSunriseMinutes?: number; // e.g. 45 min for dawn rigging
  postSunsetMinutes?: number; // e.g. 15 min for dusk
  earliestLocalTime?: string; // "HH:MM" e.g. "05:15"
  latestLocalTime?: string;   // "HH:MM" e.g. "12:00" or "21:00"
}

export interface SpotLakeProfile {
  fetchByDirectionKm: Partial<Record<WindDirection, number>>;
  exposureByDirection?: Partial<Record<WindDirection, number>>;
  flatThresholdKt: number;
  chopThresholdKt: number;
  rampThresholdKt?: number;
  extremeThresholdKt: number;
}

export interface ConditionalBoost {
  applicableRegimeIds: string[];
  localTimeWindow?: { startHour: number; endHour: number };
  allowedDirectionSectors?: { fromDeg: number; toDeg: number }[];
  minModelWind?: number;
  maxModelWind?: number;
  minRecentPrecipitation?: number; // e.g. precipitation12hMm
  maxCurrentPrecipitation?: number; // e.g. precipitationMm
  maxAdditiveBoost?: number; // factor boost
  maxMultiplicativeBoost?: number;
  boostAmount?: number;
  confidencePenalty?: number;
}

export interface SpotLocalCorrectionConfig {
  baseCorrectionFactor: number;
  minFactor: number;
  maxFactor: number;
  summerBoostMonths?: number[]; // [6, 7, 8]
  summerBoostAmount?: number;
  diurnalThermalBoost?: DiurnalThermalBoostConfig;
  postRainBoost?: {
    enabled?: boolean;
    maxBoost?: number; // e.g. 0.20
    minPrecipitation12hMm?: number; // e.g. 1.0
  };
  conditionalBoosts?: ConditionalBoost[];
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
  seaProfile?: SpotSeaProfile; // Marine exposure and coastal transformation profile (ocean/sea)
  lakeProfile?: SpotLakeProfile; // Inland lake wave & fetch profile
  operatingWindow?: OperatingWindow; // Spot-specific operational daylight/twilight window
  hardGates?: HardGateRule[];
  defaultStyle: WaterState;
  preferredStyles?: Partial<Record<WaterState, number>>;
  regimeQualityCurves?: Record<string, QualityPoint[]>;
  directionScores?: Partial<Record<WindDirection, number>> & { default?: number };
  styleRules?: {
    waveThresholdWind?: number;
    bumpAndJumpThresholdWind?: number;
    favoredDirections?: WindDirection[];
  };
}

export interface RegimeCriteria {
  referenceSpotIds?: string[]; // IDs of spots whose raw flow defines the regional regime
  minRawWind?: number;
  maxRawWind?: number;
  directions?: WindDirection[];
  minPrecipitation12hMm?: number;
  maxPrecipitationCurrentMm?: number;
  allowedHours?: [number, number]; // [startHour, endHour] in local timezone e.g. [5, 11]
  convectiveThresholdGustRatio?: number;
}

export interface RegimeDefinition {
  id: string;
  label: string;
  description: string;
  criteria: RegimeCriteria;
}

export interface ExplanationTemplateRule {
  id: string;
  condition: {
    spotId?: string;
    regimeId?: string;
    minScore?: number;
    minWind?: number;
    minWaveHeight?: number;
    minSeaQuality?: number;
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

export interface ObservationEvidenceProfile {
  id: string;
  evidenceType: "THERMAL_SUPPORT" | "SYNOPTIC_SUPPORT" | "POST_RAIN_SUPPORT" | "CONVECTIVE_RISK" | "REGIME_CONTRADICTION";
  directionSectors: { fromDeg: number; toDeg: number }[];
  localTimeWindow?: { startHour: number; endHour: number };
  applicableRegimeIds?: string[];
  minimumMeanWind?: number;
  minimumPersistence?: number;
  requiredStationRoles?: string[];
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
  observationEvidenceProfiles?: ObservationEvidenceProfile[];
}
