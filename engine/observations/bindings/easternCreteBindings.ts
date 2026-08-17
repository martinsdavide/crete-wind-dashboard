import { SpotStationBinding } from "../types";

export const EASTERN_CRETE_STATION_BINDINGS: Record<string, SpotStationBinding[]> = {
  xerokampos: [
    {
      stationId: "greece:XEROKAMPOS",
      role: "thermal-sentinel",
      baseWeight: 0.85,
      maxAgeMinutes: 45,
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
      // Restricted to confidence, thermal-context, and regime-detection.
      // Strictly no speed-bias or current-condition until sensor representativeness is proven.
      allowedEffects: ["confidence", "thermal-context", "regime-detection"],
    },
  ],
};
