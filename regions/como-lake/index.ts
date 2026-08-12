import { RegionConfig } from "@/types/region";
import { ComoLakeSpots } from "./spots";
import { ComoLakeRegimes } from "./regimes";
import { ComoLakeExplanationRules } from "./explanations";

export const ComoLakeRegion: RegionConfig = {
  id: "como-lake",
  timezone: "Europe/Rome",

  metadata: {
    displayName: "Como Lake",
    editionTitle: "Como Lake Edition",
    subtitle: "Tivano, Breva & Alpine North Wind",
    country: "Italy",
    defaultZoom: 10,
    defaultCenter: {
      latitude: 46.02,
      longitude: 9.28,
    },
  },

  defaultSpotId: "valmadrera-pare",

  spots: ComoLakeSpots,
  regimes: ComoLakeRegimes,
  explanationRules: ComoLakeExplanationRules,
};
