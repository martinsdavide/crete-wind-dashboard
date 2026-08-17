import { ExplanationTemplateRule } from "@/types/region";

export const EasternCreteExplanationRules: ExplanationTemplateRule[] = [
  {
    id: "tenda-meltemi-superior",
    condition: {
      spotId: "tenda",
      regimeId: "MELTEMI_STRONG",
    },
    explanation:
      "Tenda provides ideal conditions today with clean exposed airflow and wave / bump & jump ramps matching your preferences.",
  },
  {
    id: "tenda-meltemi-mod",
    condition: {
      spotId: "tenda",
      regimeId: "MELTEMI_MODERATE",
    },
    explanation:
      "Tenda is delivering clean northerly wind within its ideal sweet spot with superior water state and jump ramps.",
  },
  {
    id: "kouremenos-thermal-boost",
    condition: {
      spotId: "kouremenos",
      regimeId: "MELTEMI_LIGHT",
    },
    explanation:
      "Light Meltemi conditions favour Kouremenos. Local thermal and orographic acceleration place the wind squarely in its sweet spot (18–23 kt) while other spots remain marginal.",
  },
  {
    id: "kouremenos-moderate",
    condition: {
      spotId: "kouremenos",
      minScore: 70,
    },
    explanation:
      "Kouremenos provides consistent local conditions in its moderate sweet spot with flat water.",
  },
  {
    id: "xerokampos-sw-prime",
    condition: {
      spotId: "xerokampos",
      regimeId: "WESTERLY",
    },
    explanation:
      "Meltemi is absent and flow has shifted W/SW. Xerokampos is the prime alternative spot, receiving clean side-onshore thermal breeze.",
  },
  {
    id: "xerokampos-thermal-observed",
    condition: {
      spotId: "xerokampos",
      reasonCodesAll: ["THERMAL_ACTIVE", "THERMAL_OBSERVATION_SUPPORT"],
    },
    explanation:
      "Local weather station observations confirm active W/SW thermal breeze development at Xerokampos.",
  },
  {
    id: "xerokampos-thermal-active",
    condition: {
      spotId: "xerokampos",
      reasonCodesAll: ["THERMAL_ACTIVE"],
    },
    explanation:
      "Active summer thermal reinforcement is boosting W/SW breeze into full planing conditions at Xerokampos.",
  },
  {
    id: "xerokampos-thermal-building",
    condition: {
      spotId: "xerokampos",
      reasonCodesAll: ["THERMAL_BUILDING"],
    },
    explanation:
      "W/SW thermal circulation is building towards afternoon peak at Xerokampos.",
  },
  {
    id: "xerokampos-cloud-suppressed",
    condition: {
      spotId: "xerokampos",
      reasonCodesAny: ["THERMAL_CLOUD_SUPPRESSION"],
    },
    explanation:
      "Cloud cover is suppressing thermal circulation at Xerokampos.",
  },
  {
    id: "xerokampos-southerly-prime",
    condition: {
      spotId: "xerokampos",
      regimeId: "SOUTHERLY",
    },
    explanation:
      "Southerly airflow activates Xerokampos with clean side-onshore breeze while northern spots are sheltered.",
  },
];
