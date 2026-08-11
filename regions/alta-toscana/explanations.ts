import { ExplanationTemplateRule } from "@/types/region";

export const AltaToscanaExplanationRules: ExplanationTemplateRule[] = [
  {
    id: "calambrone-freeride-ref",
    condition: {
      spotId: "calambrone",
      minScore: 65,
    },
    explanation:
      "Calambrone is preferred because western flow produces reliable freeride and bump & jump conditions with strong local reliability.",
  },
  {
    id: "vada-maestrale-boost",
    condition: {
      spotId: "vada",
      regimeId: "MAESTRALE",
      minScore: 70,
    },
    explanation:
      "Vada benefits from powerful local Venturi acceleration under NW Maestrale, delivering premium freeride and jump ramps.",
  },
  {
    id: "il-sale-libeccio-wave",
    condition: {
      spotId: "il-sale",
      regimeId: "LIBECCIO",
      minScore: 70,
    },
    explanation:
      "Il Sale is preferred because the incoming SW swell aligns directly with the rocky reef, generating the region's cleanest and most powerful wave ramps.",
  },
  {
    id: "il-sale-ponente-wave",
    condition: {
      spotId: "il-sale",
      regimeId: "PONENTE",
      minScore: 70,
    },
    explanation:
      "Il Sale offers superior wave sailing with clean rolling sets and excellent side-onshore ramp angles under Ponente.",
  },
  {
    id: "lido-camaiore-versilia",
    condition: {
      spotId: "lido-di-camaiore",
      regimeId: "LIBECCIO",
      minScore: 65,
    },
    explanation:
      "Lido di Camaiore offers the best organized wave conditions in Versilia with consistent beach break surf lines.",
  },
  {
    id: "forte-marmi-wave",
    condition: {
      spotId: "forte-dei-marmi",
      minScore: 65,
    },
    explanation:
      "Forte dei Marmi delivers quality wave ramps shaped by the northern Versilia coastal bathymetry and pier.",
  },
  {
    id: "donoratico-transition",
    condition: {
      spotId: "castagneto-donoratico",
      minScore: 65,
    },
    explanation:
      "Donoratico delivers versatile freeride and bump & jump sailing with smooth rolling swell along the Etruscan coast.",
  },
];
