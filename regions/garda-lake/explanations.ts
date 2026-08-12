import { ExplanationTemplateRule } from "@/types/region";

export const GardaLakeExplanationRules: ExplanationTemplateRule[] = [
  {
    id: "garda_peler_pra",
    condition: {
      spotId: "pra-de-la-fam",
      regimeId: "GARDA_PELER",
      minScore: 70,
    },
    explanation:
      "Classic morning Pelèr is active along the western cliffs. Peak acceleration occurs once sunlight warms the towering terrain above Tignale.",
  },
  {
    id: "garda_peler_malcesine",
    condition: {
      spotId: "malcesine-navene",
      regimeId: "GARDA_PELER",
      minScore: 70,
    },
    explanation:
      "Early morning Pelèr is established off Navene and Malcesine, delivering crisp northerly thermal ramps under Mount Baldo.",
  },
  {
    id: "garda_ora_torbole",
    condition: {
      spotId: "torbole",
      regimeId: "GARDA_ORA",
      minScore: 70,
    },
    explanation:
      "Strong afternoon Ora is powering the northern basin. The southerly breeze accelerates through the mountain funnel into Torbole.",
  },
  {
    id: "garda_ora_riva",
    condition: {
      spotId: "riva-del-garda",
      regimeId: "GARDA_ORA",
      minScore: 70,
    },
    explanation:
      "Solid afternoon Ora along the northwestern shoreline under Monte Brione, offering consistent freeride and bump-and-jump conditions.",
  },
  {
    id: "garda_strong_north",
    condition: {
      regimeId: "GARDA_STRONG_NORTH",
      minScore: 70,
    },
    explanation:
      "Sustained synoptic North gradient blowing down the entire lake. Expect heavy chop and powerful gusts suitable for experienced riders.",
  },
  {
    id: "garda_foehn",
    condition: {
      regimeId: "GARDA_FOEHN",
      minScore: 70,
    },
    explanation:
      "Alpine Föhn event in progress: warm, gusty, and rapid northerly acceleration across the water.",
  },
  {
    id: "garda_transition",
    condition: {
      regimeId: "GARDA_TRANSITION",
    },
    explanation:
      "Midday thermal transition: the morning Pelèr has faded and the afternoon Ora is organizing across the southern and central lake.",
  },
];
