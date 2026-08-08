import { WindDirection } from "./weather";

export interface SpotConfig {
  id: "kouremenos" | "tenda";
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
