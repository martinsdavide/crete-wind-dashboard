import { WaterState, WindDirection } from "./weather";

/**
 * Raw hourly marine forecast point from an external wave model provider.
 */
export interface MarineForecastPoint {
  timestamp: string; // ISO 8601 UTC string

  waveHeight: number | null; // significant wave height (Hs) in metres
  wavePeriod: number | null; // mean/peak wave period (Tp) in seconds
  waveDirection: number | null; // wave direction in degrees (0-359, coming from)

  swellHeight?: number | null; // swell wave height in metres
  swellPeriod?: number | null; // swell wave period in seconds
  swellDirection?: number | null; // swell wave direction in degrees

  windWaveHeight?: number | null; // local wind-wave height in metres
  windWavePeriod?: number | null; // local wind-wave period in seconds
  windWaveDirection?: number | null; // local wind-wave direction in degrees

  provider: string; // e.g. "ECMWF WAM (via Open-Meteo)"
}

/**
 * Normalized collection of marine forecast points for a specific coordinate.
 */
export interface MarineForecast {
  latitude: number;
  longitude: number;
  points: MarineForecastPoint[];
  providerModel: string;
}

/**
 * Evaluated and spot-transformed sea state condition for a specific hour.
 */
export interface SeaStateEvaluation {
  state: WaterState; // FLAT | CHOP | BUMP_AND_JUMP | WAVE

  seaQualityScore: number; // 0-100 objective marine condition score

  waveHeight: number | null; // transformed significant wave height in metres
  rawWaveHeight?: number | null; // raw unattenuated offshore significant wave height (Hs) in metres
  wavePeriod: number | null; // wave period in seconds
  waveDirection: number | null; // wave direction in degrees

  swellHeight?: number | null;
  swellPeriod?: number | null;
  swellDirection?: number | null;

  exposureScore: number; // 0-100 (how exposed the spot is to the current wave direction)
  alignmentScore: number; // 0-100 (how well the wave direction aligns with the spot orientation)
  organizationScore: number; // 0-100 (wave period / swell organization quality)

  confidence: number; // 0-100

  source: "MARINE_FORECAST" | "WIND_DERIVED_FALLBACK";
}

/**
 * Coastal marine exposure and transformation profile for a spot.
 */
export interface SpotSeaProfile {
  // Coastal exposure factors by incoming wave direction
  exposureDirections?: {
    direction: WindDirection | string;
    factor: number; // 0.0 (fully sheltered/attenuated) to 1.0 (fully open/exposed)
  }[];

  // Configurable wave height curve (height in m -> score 0-100)
  heightQualityCurve?: {
    height: number;
    score: number;
  }[];

  // Preferred wave height bounds
  preferredWaveHeight?: {
    min?: number; // min sailable wave height (m)
    idealMin?: number; // sweet spot start (m)
    idealMax?: number; // sweet spot ceiling (m)
    max?: number; // comfort limit (m)
  };

  // Preferred wave period bounds
  preferredPeriod?: {
    min?: number; // min period (s)
    idealMin?: number; // ideal period start (s)
    idealMax?: number; // ideal period ceiling (s)
  };

  // Ideal wave directions for clean surf / ramps
  preferredWaveDirections?: (WindDirection | string)[];

  // Spot water state preference multipliers
  preferredStates?: Partial<Record<WaterState, number>>;
}
