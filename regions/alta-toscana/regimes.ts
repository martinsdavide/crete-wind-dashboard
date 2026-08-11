import { RegimeDefinition } from "@/types/region";

export const AltaToscanaRegimes: RegimeDefinition[] = [
  {
    id: "MAESTRALE",
    label: "Maestrale",
    description: "North-westerly gradient flow (NW/WNW/NNW) delivering steady acceleration at Vada and Calambrone.",
    criteria: {
      directions: ["NW", "WNW", "NNW"],
      minRawWind: 14,
    },
  },
  {
    id: "LIBECCIO",
    label: "Libeccio",
    description: "South-westerly storm flow (SW/WSW/SSW) generating powerful surf at Il Sale and Versilia beach breaks.",
    criteria: {
      directions: ["SW", "WSW", "SSW"],
      minRawWind: 14,
    },
  },
  {
    id: "PONENTE",
    label: "Ponente",
    description: "Direct westerly Tyrrhenian flow (W) bringing consistent side-onshore breeze across all coastal spots.",
    criteria: {
      directions: ["W", "WSW", "WNW"],
      minRawWind: 12,
    },
  },
  {
    id: "SCIROCCO",
    label: "Scirocco",
    description: "South-easterly / southerly flow (SE/SSE/S) accelerating along the southern Etruscan coast.",
    criteria: {
      directions: ["SE", "SSE", "S", "ESE"],
      minRawWind: 12,
    },
  },
  {
    id: "TRAMONTANA",
    label: "Tramontana",
    description: "Cold gusty northerly airflow (N/NNE/NNW) from the Apennine and Apuan mountains.",
    criteria: {
      directions: ["N", "NNE", "NNW"],
      minRawWind: 15,
    },
  },
  {
    id: "THERMAL",
    label: "Thermal Breeze",
    description: "Classic summer afternoon sea breeze (W/WSW/NW) activated by inland heating.",
    criteria: {
      directions: ["W", "WSW", "NW", "WNW"],
      minRawWind: 8,
      maxRawWind: 15,
    },
  },
  {
    id: "WEAK_VARIABLE",
    label: "Light / Variable",
    description: "Sub-planing conditions with light or disorganized airflow.",
    criteria: {
      maxRawWind: 11,
    },
  },
];
