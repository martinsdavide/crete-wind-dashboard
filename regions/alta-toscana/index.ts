import { RegionConfig } from "@/types/region";
import { AltaToscanaSpots } from "./spots";
import { AltaToscanaRegimes } from "./regimes";
import { AltaToscanaExplanationRules } from "./explanations";

export const AltaToscanaRegion: RegionConfig = {
  id: "alta-toscana",
  metadata: {
    displayName: "Alta Toscana",
    editionTitle: "Alta Toscana Edition",
    subtitle: "Versilia • Pisan Coast • Etruscan Coast",
    country: "Italy",
    defaultZoom: 10,
    defaultCenter: {
      latitude: 43.55,
      longitude: 10.32,
    },
  },
  timezone: "Europe/Rome",
  spots: AltaToscanaSpots,
  regimes: AltaToscanaRegimes,
  defaultSpotId: "calambrone",
  explanationRules: AltaToscanaExplanationRules,
};
