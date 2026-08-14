import { SpotStationBinding } from "../types";

export const GARDA_LAKE_STATION_BINDINGS: Record<string, SpotStationBinding[]> = {
  torbole: [
    {
      stationId: "meteotrentino:T0193",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 30,
      delayedUseUntilMinutes: 90,
      delayedUsePolicy: "DECAYED_PERSISTENCE",
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "pressure", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias", "timing-correction", "confidence", "regime-detection"],
    },
    {
      stationId: "meteotrentino:T0401",
      role: "valley",
      baseWeight: 0.40,
      maxAgeMinutes: 45,
      parameters: ["temperature", "precipitation"],
      allowedEffects: ["thermal-context", "rain-context"],
    },
    {
      stationId: "meteotrentino:T0354",
      role: "mountain",
      baseWeight: 0.30,
      maxAgeMinutes: 45,
      parameters: ["wind_speed", "wind_direction", "pressure"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
  "riva-del-garda": [
    {
      stationId: "meteotrentino:T0193",
      role: "lake-upwind",
      baseWeight: 0.70,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction", "wind_gust"],
      allowedEffects: ["current-condition", "speed-bias", "timing-correction", "confidence"],
    },
    {
      stationId: "meteotrentino:T0401",
      role: "valley",
      baseWeight: 0.40,
      maxAgeMinutes: 45,
      parameters: ["temperature", "precipitation"],
      allowedEffects: ["thermal-context", "rain-context"],
    },
  ],
  "pra-de-la-fam": [
    {
      stationId: "meteotrentino:T0193",
      role: "lake-upwind",
      baseWeight: 0.35,
      maxAgeMinutes: 30,
      compatibleDirections: [{ fromDeg: 330, toDeg: 45 }],
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
    {
      stationId: "meteotrentino:T0354",
      role: "mountain",
      baseWeight: 0.35,
      maxAgeMinutes: 45,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
    {
      stationId: "meteotrentino:T0401",
      role: "valley",
      baseWeight: 0.25,
      maxAgeMinutes: 45,
      parameters: ["temperature", "precipitation"],
      allowedEffects: ["thermal-context", "rain-context"],
    },
  ],
  "malcesine-navene": [
    {
      stationId: "meteotrentino:T0193",
      role: "lake-upwind",
      baseWeight: 0.45,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
  "campione-garda": [
    {
      stationId: "meteotrentino:T0193",
      role: "lake-upwind",
      baseWeight: 0.35,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
  limone: [
    {
      stationId: "meteotrentino:T0193",
      role: "lake-upwind",
      baseWeight: 0.50,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
};
