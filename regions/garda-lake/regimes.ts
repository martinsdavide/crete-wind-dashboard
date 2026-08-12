import { RegimeDefinition } from "@/types/region";

export type GardaLakeRegime =
  | "GARDA_PELER"
  | "GARDA_ORA"
  | "GARDA_STRONG_NORTH"
  | "GARDA_FOEHN"
  | "GARDA_TRANSITION"
  | "GARDA_NEUTRAL"
  | "GARDA_CONVECTIVE_HAZARD";

export const GardaLakeRegimes: RegimeDefinition[] = [
  {
    id: "GARDA_CONVECTIVE_HAZARD",
    label: "Convective Storm Hazard",
    description: "Alpine convective storm cells, severe gust spikes, or unstable frontal downdrafts on the lake.",
    criteria: {
      convectiveThresholdGustRatio: 1.70,
      minRawWind: 34,
    },
  },
  {
    id: "GARDA_FOEHN",
    label: "Alpine North Föhn",
    description: "Violent, warm and dry descending northerly storm flow from the Alps producing heavy lake chop and powerful gusts.",
    criteria: {
      directions: ["N", "NNW", "NNE"],
      minRawWind: 30,
    },
  },
  {
    id: "GARDA_STRONG_NORTH",
    label: "Strong Synoptic North",
    description: "Sustained non-thermal northerly gradient driving steep chop and ramps across the central and southern lake.",
    criteria: {
      directions: ["N", "NNE", "NNW", "NE"],
      minRawWind: 20,
    },
  },
  {
    id: "GARDA_PELER",
    label: "Pelèr Morning Thermal",
    description: "Classic morning northerly breeze driven by overnight alpine cooling, peaking between sunrise and mid-morning.",
    criteria: {
      directions: ["N", "NNE", "NNW", "NE"],
      minRawWind: 7,
      maxRawWind: 22,
      allowedHours: [4, 12],
    },
  },
  {
    id: "GARDA_ORA",
    label: "Ora Afternoon Thermal",
    description: "Classic sunny afternoon southerly thermal wind accelerating into the narrow northern mountain funnel.",
    criteria: {
      directions: ["S", "SSW", "SSE", "SW"],
      minRawWind: 8,
      maxRawWind: 26,
      allowedHours: [11, 20],
    },
  },
  {
    id: "GARDA_TRANSITION",
    label: "Pelèr–Ora Transition",
    description: "Midday lull between the weakening Pelèr and the developing Ora breeze.",
    criteria: {
      maxRawWind: 9,
      allowedHours: [10, 14],
    },
  },
  {
    id: "GARDA_NEUTRAL",
    label: "Calm / Variable Lake Flow",
    description: "Light or unorganized airflow below standard thermal thresholds.",
    criteria: {},
  },
];
