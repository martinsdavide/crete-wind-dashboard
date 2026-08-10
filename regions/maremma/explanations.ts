import { ExplanationTemplateRule } from "@/types/region";

export const MaremmaExplanationRules: ExplanationTemplateRule[] = [
  {
    id: "talamone-thermal-winner",
    condition: {
      spotId: "talamone",
      regimeId: "THERMAL",
    },
    explanation:
      "Talamone benefits from the classic afternoon thermal reinforcement, providing reliable planing breeze in a sheltered bay while other spots remain light.",
  },
  {
    id: "talamone-maestrale-winner",
    condition: {
      spotId: "talamone",
      regimeId: "MAESTRALE",
    },
    explanation:
      "Talamone delivers optimal flat-to-chop freeride conditions today with clean side-shore NW airflow and thermal boost.",
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
    id: "marina-grosseto-libeccio-winner",
    condition: {
      spotId: "marina-di-grosseto",
      regimeId: "LIBECCIO",
    },
    explanation:
      "Marina di Grosseto receives direct side-onshore Libeccio airflow with rolling swell across its open sandy beach.",
  },
  {
    id: "marina-grosseto-winner",
    condition: {
      spotId: "marina-di-grosseto",
    },
    explanation:
      "Marina di Grosseto offers a balanced open-coast session with steady side-shore breeze and comfortable bump & jump conditions.",
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
