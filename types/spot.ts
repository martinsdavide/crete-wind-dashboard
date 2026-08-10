import { WindDirection } from "./weather";

export type SpotId = "kouremenos" | "tenda" | "xerokampos";

export interface SpotConfig {
  id: SpotId;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  localCorrectionEnabled: boolean;
}

export type DirectionFactors = {
  [key in WindDirection]?: number;
} & {
  default: number;
};

export interface ThermalPoint {
  hour: number; // 0 to 24
  factor: number;
}

export interface CloudAttenuationTier {
  maxCover: number;
  factor: number;
}

export interface SpotCorrectionProfile {
  directionFactors: DirectionFactors;
  applyThermal: boolean;
  thermalSeasonStartMonth?: number; // 1-indexed (e.g. 5 for May)
  thermalSeasonStartDay?: number;   // 15
  thermalSeasonEndMonth?: number;   // 9 for September
  thermalSeasonEndDay?: number;     // 30
  thermalDailyProfile?: ThermalPoint[];
  cloudAttenuation?: CloudAttenuationTier[];
  minCorrectionFactor: number;
  maxCorrectionFactor: number;
  gustAdjustmentFactor: number;
  directionScores: {
    [key in WindDirection]?: number;
  } & {
    default: number;
  };
}

export interface SpotQualityCurvePoint {
  wind: number; // knots
  score: number; // 0-100
}

export interface SpotQualityProfile {
  spotId: SpotId;
  preferredDirections: WindDirection[];
  acceptableDirections: WindDirection[];
  excludedDirections: WindDirection[];
  idealWindRange: {
    min: number;
    max: number;
  };
  usableWindRange: {
    min: number;
    max: number;
  };
  strongWindPenaltyStart?: number;
  hardWindLimit?: number;
  qualityCurve: SpotQualityCurvePoint[];
  sailingStyle: {
    flatWater: number;
    bumpAndJump: number;
    wave: number;
    freestyle: number;
  };
}

export interface RiderPreferences {
  preferredStyles: {
    wave: number;
    bumpAndJump: number;
    freeride: number;
    freestyle: number;
    flatWater: number;
  };
  spotPreferences: Record<string, number> & {
    kouremenos?: number;
    tenda?: number;
    xerokampos?: number;
  };
  maxComfortWindBySpot: Record<string, number> & {
    kouremenos?: number;
    tenda?: number;
    xerokampos?: number;
  };
  waveBonusMax: number;
}
