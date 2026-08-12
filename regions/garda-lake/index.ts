import { RegionConfig } from "@/types/region";
import { GardaLakeSpots } from "./spots";
import { GardaLakeRegimes } from "./regimes";
import { GardaLakeExplanationRules } from "./explanations";

export const GardaLakeRegion: RegionConfig = {
  id: "garda-lake",
  metadata: {
    displayName: "Garda Lake",
    editionTitle: "Garda Lake Edition",
    subtitle: "Pelèr, Ora & Alpine Wind",
    country: "Italy",
    defaultZoom: 9,
    defaultCenter: {
      latitude: 45.70,
      longitude: 10.68,
    },
  },
  timezone: "Europe/Rome",
  spots: GardaLakeSpots,
  regimes: GardaLakeRegimes,
  defaultSpotId: "pra-de-la-fam",
  explanationRules: GardaLakeExplanationRules,
};
