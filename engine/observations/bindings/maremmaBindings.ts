import { SpotStationBinding } from "../types";

export const MAREMMA_STATION_BINDINGS: Record<string, SpotStationBinding[]> = {
  "marina-di-grosseto": [
    {
      stationId: "siar:marina_grosseto",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 45,
      // Binding is only active when SIR_TOSCANA_API_URL (or SIAR_API_URL) is configured in the environment.
      // Without the env var, SiarClient returns no data and this binding produces no effect.
      requiresEnv: "SIR_TOSCANA_API_URL",
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias"],
    },
  ],
  talamone: [
    {
      stationId: "siar:talamone_sentinel",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 45,
      requiresEnv: "SIR_TOSCANA_API_URL",
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias"],
    },
  ],
};

