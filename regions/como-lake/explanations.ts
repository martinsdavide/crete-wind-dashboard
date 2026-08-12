import { ExplanationTemplateRule } from "@/types/region";

export const ComoLakeExplanationRules: ExplanationTemplateRule[] = [
  {
    id: "valmadrera-tivano-ref",
    condition: {
      spotId: "valmadrera-pare",
      regimeId: "COMO_TIVANO",
      minScore: 65,
    },
    explanation:
      "Valmadrera–Parè is preferred because morning northern thermal drainage produces clean flat-to-chop freeride conditions in the Lecco branch.",
  },
  {
    id: "valmadrera-post-rain",
    condition: {
      spotId: "valmadrera-pare",
      regimeId: "COMO_POST_RAIN_NORTH",
      minScore: 65,
    },
    explanation:
      "Valmadrera–Parè benefits from reinforced northerly drainage following overnight rainfall in the surrounding Prealpine valleys.",
  },
  {
    id: "dervio-breva-ref",
    condition: {
      spotId: "dervio",
      regimeId: "COMO_BREVA",
      minScore: 65,
    },
    explanation:
      "Dervio offers the most consistent afternoon Breva with steady side-onshore thermal breeze across the central lake basin.",
  },
  {
    id: "dervio-strong-north",
    condition: {
      spotId: "dervio",
      regimeId: "COMO_STRONG_NORTH",
      minScore: 70,
    },
    explanation:
      "Dervio is the premier choice for experienced riders under strong North flow, delivering steep chop and powerful jump ramps.",
  },
  {
    id: "dervio-foehn",
    condition: {
      spotId: "dervio",
      regimeId: "COMO_FOEHN",
      minScore: 70,
    },
    explanation:
      "Dervio offers high-performance alpine Föhn conditions with strong wind and dynamic lake chop.",
  },
  {
    id: "colico-breva",
    condition: {
      spotId: "colico",
      regimeId: "COMO_BREVA",
      minScore: 65,
    },
    explanation:
      "Colico provides excellent upper-lake Breva conditions with safe wide recovery and steady thermal flow.",
  },
  {
    id: "cremia-venturi",
    condition: {
      spotId: "cremia",
      regimeId: "COMO_BREVA",
      minScore: 65,
    },
    explanation:
      "Cremia accelerates early afternoon Breva due to the natural Venturi narrowing along the western shoreline.",
  },
  {
    id: "gera-lario-freeride",
    condition: {
      spotId: "gera-lario",
      regimeId: "COMO_BREVA",
      minScore: 65,
    },
    explanation:
      "Gera Lario offers smooth freeride conditions at the northern lake boundary where Breva compresses against the Alps.",
  },
  {
    id: "gravedona-accessible",
    condition: {
      spotId: "gravedona",
      minScore: 60,
    },
    explanation:
      "Gravedona delivers accessible and forgiving freeride sailing with smooth rolling chop in the northwest bay.",
  },
];
