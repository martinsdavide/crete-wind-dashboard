import { SpotStationBinding } from "../types";

export const COMO_LAKE_STATION_BINDINGS: Record<string, SpotStationBinding[]> = {
  "valmadrera-pare": [
    {
      stationId: "lombardia:valmadrera",
      role: "spot-local",
      baseWeight: 0.85,
      maxAgeMinutes: 45,
      parameters: ["precipitation", "temperature", "humidity"],
      allowedEffects: ["rain-context", "thermal-context", "confidence"],
    },
    {
      stationId: "lombardia:colico",
      role: "lake-upwind",
      baseWeight: 0.30,
      maxAgeMinutes: 30,
      compatibleDirections: [{ fromDeg: 330, toDeg: 45 }],
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
    {
      stationId: "meteoswiss:san_bernardino",
      role: "gradient",
      baseWeight: 0.25,
      maxAgeMinutes: 60,
      parameters: ["pressure", "temperature"],
      allowedEffects: ["regime-detection", "thermal-context"],
    },
  ],
  dervio: [
    {
      stationId: "lombardia:colico",
      role: "lake-upwind",
      baseWeight: 0.80,
      maxAgeMinutes: 30,
      compatibleDirections: [{ fromDeg: 330, toDeg: 45 }],
      parameters: ["wind_speed", "wind_direction", "wind_gust"],
      allowedEffects: ["regime-detection", "speed-bias", "current-condition", "confidence"],
    },
    {
      stationId: "meteoswiss:san_bernardino",
      role: "gradient",
      baseWeight: 0.30,
      maxAgeMinutes: 60,
      parameters: ["pressure", "temperature"],
      allowedEffects: ["regime-detection"],
    },
  ],
  colico: [
    {
      stationId: "lombardia:colico",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias", "regime-detection", "confidence"],
    },
  ],
  "gera-lario": [
    {
      stationId: "lombardia:colico",
      role: "lake-upwind",
      baseWeight: 0.75,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
  cremia: [
    {
      stationId: "lombardia:colico",
      role: "lake-upwind",
      baseWeight: 0.50,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
  gravedona: [
    {
      stationId: "lombardia:colico",
      role: "lake-upwind",
      baseWeight: 0.70,
      maxAgeMinutes: 30,
      parameters: ["wind_speed", "wind_direction"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ],
};
