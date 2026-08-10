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
};
