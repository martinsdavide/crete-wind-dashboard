import { SpotConfig } from "@/types/spot";

export const SPOTS: Record<"kouremenos" | "tenda", SpotConfig> = {
  kouremenos: {
    id: "kouremenos",
    name: "Kouremenos",
    subtitle: "Palekastro",
    latitude: 35.20581,
    longitude: 26.27230,
    localCorrectionEnabled: true,
  },
  tenda: {
    id: "tenda",
    name: "Tenda",
    subtitle: "Cape Sidero",
    latitude: 35.28932,
    longitude: 26.28981,
    localCorrectionEnabled: true,
  },
};

export const SPOT_LIST = Object.values(SPOTS);
