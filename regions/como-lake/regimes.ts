import { RegimeDefinition } from "@/types/region";

export const ComoLakeRegimes: RegimeDefinition[] = [
  {
    id: "COMO_CONVECTIVE_HAZARD",
    label: "Convective Hazard / Storm",
    description: "Active thunderstorm, severe downburst, or lightning near Lake Como. All spots are unsafe.",
    criteria: {
      minRawWind: 45, // Extreme sudden wind or convective trigger
    },
  },
  {
    id: "COMO_FOEHN",
    label: "Alpine Föhn",
    description: "Dry, violent northerly alpine storm flow (N/NNW/NNE) exceeding 30 knots.",
    criteria: {
      directions: ["N", "NNW", "NNE"],
      minRawWind: 30,
    },
  },
  {
    id: "COMO_STRONG_NORTH",
    label: "Strong North Flow",
    description: "Synoptic northerly gradient flow distinct from morning Tivano, delivering expert conditions at Dervio.",
    criteria: {
      directions: ["N", "NNW", "NNE", "NE"],
      minRawWind: 18,
    },
  },
  {
    id: "COMO_POST_RAIN_NORTH",
    label: "Post-Rain North Drainage",
    description: "Reinforced morning northerly drainage following overnight rainfall in the alpine valleys.",
    criteria: {
      directions: ["N", "NNE", "NE", "ENE"],
      minRawWind: 11,
      minPrecipitation12hMm: 1.0,
      maxPrecipitationCurrentMm: 0.5,
      allowedHours: [5, 11],
    },
  },
  {
    id: "COMO_TIVANO",
    label: "Tivano Morning Thermal",
    description: "Classic morning thermal circulation from the northern quadrants, strongest in the Lecco branch at Valmadrera.",
    criteria: {
      directions: ["N", "NNE", "NE", "ENE"],
      minRawWind: 8,
      maxRawWind: 18,
      allowedHours: [5, 11],
    },
  },
  {
    id: "COMO_BREVA",
    label: "Breva Afternoon Thermal",
    description: "Classic sunny afternoon thermal breeze from the south, powering Dervio, Colico, Cremia, and Gera Lario.",
    criteria: {
      directions: ["S", "SSW", "SSE", "SW"],
      minRawWind: 10,
      allowedHours: [11, 20],
    },
  },
  {
    id: "COMO_NEUTRAL",
    label: "Light / Variable Airflow",
    description: "Sub-planing conditions or calm transition between Tivano and Breva thermal cycles.",
    criteria: {
      maxRawWind: 10,
    },
  },
];
