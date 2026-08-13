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
  observationEvidenceProfiles: [
    {
      id: "como-breva-thermal",
      evidenceType: "THERMAL_SUPPORT",
      directionSectors: [{ fromDeg: 140, toDeg: 230 }],
    },
    {
      id: "como-tivano-north",
      evidenceType: "SYNOPTIC_SUPPORT",
      directionSectors: [{ fromDeg: 330, toDeg: 40 }],
    },
    {
      id: "como-post-rain-boost",
      evidenceType: "POST_RAIN_SUPPORT",
      directionSectors: [{ fromDeg: 330, toDeg: 50 }],
    },
  ],
};
