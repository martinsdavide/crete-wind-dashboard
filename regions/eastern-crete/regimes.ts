import { RegimeDefinition } from "@/types/region";

export const EasternCreteRegimes: RegimeDefinition[] = [
  {
    id: "MELTEMI_STRONG",
    label: "Strong Meltemi",
    description: "Regional northern gradient exceeding 22 knots raw model wind.",
    criteria: {
      directions: ["N", "NNW", "NNE", "NW", "NE"],
      minRawWind: 22,
    },
  },
  {
    id: "MELTEMI_MODERATE",
    label: "Moderate Meltemi",
    description: "Standard summer northern Aegean breeze between 14 and 22 knots raw wind.",
    criteria: {
      directions: ["N", "NNW", "NNE", "NW", "NE"],
      minRawWind: 14,
      maxRawWind: 22,
    },
  },
  {
    id: "MELTEMI_LIGHT",
    label: "Light Meltemi",
    description: "Weak northern gradient under 14 knots relying heavily on local Palekastro thermal acceleration.",
    criteria: {
      directions: ["N", "NNW", "NNE", "NW", "NE"],
      maxRawWind: 14,
    },
  },
  {
    id: "SOUTHERLY",
    label: "Southerly Flow",
    description: "Warm southern Mediterranean airflow (S/SE/SSW).",
    criteria: {
      directions: ["S", "SSE", "SE", "SSW"],
    },
  },
  {
    id: "WESTERLY",
    label: "Westerly Flow",
    description: "Ionian/Libyan sea westerly airflow (W/WSW/SW).",
    criteria: {
      directions: ["W", "WSW", "SW", "WNW"],
    },
  },
];
