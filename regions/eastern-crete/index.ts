import { RegionConfig } from "@/types/region";
import { EasternCreteMetadata } from "./metadata";
import { EasternCreteSpots } from "./spots";
import { EasternCreteRegimes } from "./regimes";
import { EasternCreteExplanationRules } from "./explanations";
import { DEFAULT_RIDER_PREFERENCES } from "@/config/riderPreferences";

export const EasternCreteRegion: RegionConfig = {
  id: "eastern-crete",
  metadata: EasternCreteMetadata,
  timezone: "Europe/Athens",
  spots: EasternCreteSpots,
  regimes: EasternCreteRegimes,
  defaultSpotId: "kouremenos",
  explanationRules: EasternCreteExplanationRules,
  defaultRiderPreferences: DEFAULT_RIDER_PREFERENCES,
};
