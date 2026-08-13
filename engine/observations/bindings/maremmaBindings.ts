import { SpotStationBinding } from "../types";

export const MAREMMA_STATION_BINDINGS: Record<string, SpotStationBinding[]> = {
  "marina-di-grosseto": [
    {
      stationId: "siar:marina_grosseto",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 45,
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias", "regime-detection", "confidence"],
    },
  ],
  talamone: [
    {
      stationId: "siar:talamone_sentinel",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 45,
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias", "regime-detection", "confidence"],
    },
  ],
};
