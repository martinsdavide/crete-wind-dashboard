import { WindRegime } from "@/types/weather";

export interface RegimeDefinition {
  regime: WindRegime;
  label: string;
  description: string;
}

export const REGIME_DEFINITIONS: Record<WindRegime, RegimeDefinition> = {
  MELTEMI_STRONG: {
    regime: "MELTEMI_STRONG",
    label: "Strong Meltemi",
    description: "Strong northerly flow across the Aegean. Tenda is the primary high-wind wave candidate.",
  },
  MELTEMI_MODERATE: {
    regime: "MELTEMI_MODERATE",
    label: "Moderate Meltemi",
    description: "Classic Meltemi conditions. Kouremenos and Tenda both active in ideal ranges.",
  },
  MELTEMI_LIGHT: {
    regime: "MELTEMI_LIGHT",
    label: "Light Meltemi",
    description: "Light northerly flow. Kouremenos local acceleration offers the best chance of usable wind.",
  },
  WESTERLY: {
    regime: "WESTERLY",
    label: "Westerly Flow",
    description: "Non-Meltemi westerly pattern. Xerokampos becomes the prime candidate.",
  },
  SOUTHWESTERLY: {
    regime: "SOUTHWESTERLY",
    label: "Southwesterly Flow",
    description: "SW weather system or thermal flow favoring Xerokampos.",
  },
  OTHER: {
    regime: "OTHER",
    label: "Variable / Transitional",
    description: "Transitional or light variable winds.",
  },
};
