import { SpotConfig } from "@/types/spot";

export const SPOTS: Record<"kouremenos" | "tenda" | "xerokampos", SpotConfig> = {
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
  xerokampos: {
    id: "xerokampos",
    name: "Xerokampos",
    subtitle: "South-East Crete",
    latitude: 35.052784,
    longitude: 26.240385,
    localCorrectionEnabled: true,
  },
};

export const SPOT_LIST = Object.values(SPOTS);
export const SPOT_IDS = ["kouremenos", "tenda", "xerokampos"] as const;
