import { RegimeDefinition } from "@/types/region";

export const MaremmaRegimes: RegimeDefinition[] = [
  {
    id: "MAESTRALE",
    label: "Maestrale",
    description: "North-westerly gradient flow (NW/WNW) exceeding 14 knots with classic clear sky conditions.",
    criteria: {
      directions: ["NW", "WNW", "NNW"],
      minRawWind: 14,
    },
  },
  {
    id: "PONENTE",
    label: "Ponente",
    description: "Direct westerly Tyrrhenian airflow (W) bringing steady side-onshore breeze.",
    criteria: {
      directions: ["W", "WSW", "WNW"],
      minRawWind: 12,
    },
  },
  {
    id: "LIBECCIO",
    label: "Libeccio",
    description: "South-westerly gradient (SW/SSW) generating building chop and wave swell across the coast.",
    criteria: {
      directions: ["SW", "SSW", "WSW"],
      minRawWind: 14,
    },
  },
  {
    id: "SCIROCCO",
    label: "Scirocco",
    description: "Warm south-easterly airflow (SE/SSE) accelerating along the southern Tuscan coastline.",
    criteria: {
      directions: ["SE", "SSE", "ESE", "S"],
      minRawWind: 12,
    },
  },
  {
    id: "TRAMONTANA",
    label: "Tramontana",
    description: "Cold gusty northerly airflow (N/NNE/NNW) from the Tuscan hills.",
    criteria: {
      directions: ["N", "NNE", "NNW"],
      minRawWind: 15,
    },
  },
  {
    id: "THERMAL",
    label: "Thermal Breeze",
    description: "Typical summer afternoon sea breeze (NW/W) activated by inland heating.",
    criteria: {
      directions: ["NW", "WNW", "W", "WSW"],
      minRawWind: 8,
      maxRawWind: 15,
    },
  },
  {
    id: "WEAK_VARIABLE",
    label: "Weak Variable",
    description: "Light and variable atmospheric conditions under 10 knots.",
    criteria: {
      maxRawWind: 10,
    },
  },
];
