import { RiderPreferences } from "@/types/spot";

export const DEFAULT_RIDER_PREFERENCES: RiderPreferences = {
  preferredStyles: {
    wave: 1.0,        // HIGH preference
    bumpAndJump: 0.9, // HIGH preference
    freeride: 0.7,    // MEDIUM
    flatWater: 0.6,   // MEDIUM
    freestyle: 0.4,   // LOW
  },
  spotPreferences: {
    tenda: 1.05,      // Slight affinity for Tenda wave environment
    kouremenos: 1.0,
    xerokampos: 1.0,
  },
  maxComfortWindBySpot: {
    kouremenos: 26,   // Kouremenos gets choppy and overpowered above 26 kt
    tenda: 34,        // Tenda handles up to 34 kt well in wave zone
    xerokampos: 28,   // Xerokampos comfort limit
  },
  waveBonusMax: 10,   // Max +10 bonus points for wave conditions in strong Meltemi
};
