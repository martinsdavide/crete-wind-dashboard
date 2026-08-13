import { RegimeDefinition } from "@/types/region";

export const MaremmaRegimes: RegimeDefinition[] = [
  {
    id: "MAREMMA_CONVECTIVE_HAZARD",
    label: "Maremma Convective Hazard",
    description: "Active convective hazard or thunderstorm risk on the Maremma coast.",
    criteria: {
      convectiveThresholdGustRatio: 1.45,
    },
  },
  {
    id: "MAREMMA_MAESTRALE",
    label: "Maremma Maestrale",
    description: "North-westerly gradient flow (NW/WNW/NNW) exceeding 14 knots with classic clear sky conditions.",
    criteria: {
      directions: ["NW", "WNW", "NNW"],
      minRawWind: 14,
    },
  },
  {
    id: "MAREMMA_PONENTE",
    label: "Maremma Ponente",
    description: "Direct westerly Tyrrhenian airflow (W) bringing steady side-onshore breeze.",
    criteria: {
      directions: ["W", "WSW", "WNW"],
      minRawWind: 12,
    },
  },
  {
    id: "MAREMMA_LIBECCIO",
    label: "Maremma Libeccio",
    description: "South-westerly gradient (SW/SSW) generating building chop and wave swell across the coast.",
    criteria: {
      directions: ["SW", "SSW", "WSW"],
      minRawWind: 14,
    },
  },
  {
    id: "MAREMMA_SCIROCCO",
    label: "Maremma Scirocco",
    description: "Warm south-easterly airflow (SE/SSE/ESE/S) accelerating along the southern Tuscan coastline.",
    criteria: {
      directions: ["SE", "SSE", "ESE", "S"],
      minRawWind: 12,
    },
  },
  {
    id: "MAREMMA_TRAMONTANA",
    label: "Maremma Tramontana",
    description: "Cold gusty northerly airflow (N/NNE/NNW) from the Tuscan hills.",
    criteria: {
      directions: ["N", "NNE", "NNW"],
      minRawWind: 15,
    },
  },
  {
    id: "MAREMMA_THERMAL",
    label: "Maremma Thermal",
    description: "Typical summer afternoon sea breeze (NW/W/SW) activated by inland heating.",
    criteria: {
      directions: ["NW", "WNW", "W", "SW", "WSW"],
      minRawWind: 8,
      maxRawWind: 16,
      allowedHours: [12, 18],
    },
  },
  {
    id: "MAREMMA_THERMAL_REINFORCED",
    label: "Maremma Thermal Reinforced",
    description: "Thermally reinforced Maestrale or Ponente afternoon breeze exceeding 16 knots.",
    criteria: {
      directions: ["NW", "WNW", "W", "SW", "WSW"],
      minRawWind: 16,
      maxRawWind: 25,
      allowedHours: [12, 18],
    },
  },
  {
    id: "MAREMMA_WEAK_VARIABLE",
    label: "Maremma Weak Variable",
    description: "Light and variable atmospheric conditions under 8 knots.",
    criteria: {
      maxRawWind: 8,
    },
  },
  {
    id: "MAREMMA_OTHER",
    label: "Maremma Other",
    description: "Neutral Maremma flow that does not match other configured regimes.",
    criteria: {},
  },
];
