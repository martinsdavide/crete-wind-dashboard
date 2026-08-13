import { RegionConfig } from "@/types/region";
import { MaremmaMetadata } from "./metadata";
import { MaremmaSpots } from "./spots";
import { MaremmaRegimes } from "./regimes";
import { MaremmaExplanationRules } from "./explanations";
import { DEFAULT_RIDER_PREFERENCES } from "@/config/riderPreferences";

export const MaremmaRegion: RegionConfig = {
  id: "maremma",
  metadata: MaremmaMetadata,
  timezone: "Europe/Rome",
  spots: MaremmaSpots,
  regimes: MaremmaRegimes,
  defaultSpotId: "talamone",
  explanationRules: MaremmaExplanationRules,
  defaultRiderPreferences: DEFAULT_RIDER_PREFERENCES,
  observationEvidenceProfiles: [
    {
      id: "maremma-thermal-breeze",
      evidenceType: "THERMAL_SUPPORT",
      directionSectors: [{ fromDeg: 210, toDeg: 320 }],
    },
    {
      id: "maremma-maestrale-synoptic",
      evidenceType: "SYNOPTIC_SUPPORT",
      directionSectors: [{ fromDeg: 290, toDeg: 340 }],
    },
  ],
};
