import { ExplanationTemplateRule } from "@/types/region";

export const MaremmaExplanationRules: ExplanationTemplateRule[] = [
  {
    id: "talamone-thermal-winner",
    condition: {
      spotId: "talamone",
      regimeId: "MAREMMA_THERMAL",
    },
    explanation:
      "Talamone benefits from the classic afternoon thermal reinforcement, providing reliable planing breeze in a sheltered bay while other spots remain light.",
  },
  {
    id: "talamone-thermal-reinforced-winner",
    condition: {
      spotId: "talamone",
      regimeId: "MAREMMA_THERMAL_REINFORCED",
    },
    explanation:
      "Talamone delivers high-quality flat-to-chop freeride conditions with strong thermal acceleration into the bay.",
  },
  {
    id: "talamone-maestrale-winner",
    condition: {
      spotId: "talamone",
      regimeId: "MAREMMA_MAESTRALE",
    },
    explanation:
      "Talamone delivers optimal flat-to-chop freeride conditions today with clean side-shore NW airflow.",
  },
  {
    id: "punta-ala-wave-winner",
    condition: {
      spotId: "punta-ala",
    },
    explanation:
      "Punta Ala is preferred because the exposed W/NW flow provides stronger wave-oriented conditions and jump ramps matching your preferences.",
  },
  {
    id: "marina-grosseto-maestrale-winner",
    condition: {
      spotId: "marina-di-grosseto",
      regimeId: "MAREMMA_MAESTRALE",
    },
    explanation:
      "Marina di Grosseto delivers optimal bump & jump conditions with clean side-on NW Maestrale thermal breeze and easy exit through the beach.",
  },
  {
    id: "marina-grosseto-thermal-winner",
    condition: {
      spotId: "marina-di-grosseto",
      regimeId: "MAREMMA_THERMAL_REINFORCED",
    },
    explanation:
      "Marina di Grosseto offers a prime afternoon session with steady side-on NW thermal reinforcement along the central sandy coast.",
  },
  {
    id: "marina-grosseto-winner",
    condition: {
      spotId: "marina-di-grosseto",
    },
    explanation:
      "Marina di Grosseto offers a balanced open-coast session with steady side-on breeze and comfortable bump & jump conditions.",
  },
  {
    id: "giannella-flat-winner",
    condition: {
      spotId: "giannella",
    },
    explanation:
      "Giannella offers a more controlled, flatter water state under the current wind regime, ideal for comfort and high-speed runs.",
  },
  {
    id: "castiglione-winner",
    condition: {
      spotId: "castiglione-della-pescaia",
    },
    explanation:
      "Castiglione delivers clean open-sea breeze with dynamic bump & jump ramps along the northern coast.",
  },
];
