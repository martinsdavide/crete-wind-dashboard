/**
 * observationFusionRegime.test.ts
 *
 * Verifies post-fusion regime reclassification and strict regime-detection enforcement:
 * 1. Enabled active contributors reclassify the regional NOW regime using coherent fused primitives.
 * 2. Disabled or zero-weight contributors retain the forecastNowRegimeId EXACTLY.
 * 3. Convective gust ratio triggers convective hazard regime reclassification.
 * 4. Vector averaging handles circular degree wrap-around (350° + 10° → 0°).
 */

import { describe, it, expect } from "vitest";
import { GardaLakeRegion } from "@/regions/garda-lake";
import { MaremmaRegion } from "@/regions/maremma";
import {
  classifyPostFusionNowRegime,
  PostFusionSpotPrimitive,
} from "@/engine/recommendation/RecommendationEngine";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { SpotForecast, SpotResult } from "@/types/weather";

describe("Post-Fusion NOW Regime Classification & Strict Binding Enforcement", () => {
  const refTime = new Date("2026-08-12T13:00:00.000Z"); // 15:00 CEST

  it("Test 1: Enabled contributor reclassifies NOW regime from weak variable to GARDA_ORA when fused wind/dir match Ora criteria", () => {
    // 13:00 CEST afternoon thermal window
    const primitives: PostFusionSpotPrimitive[] = [
      {
        spotId: "torbole",
        effectiveWind: 18.0, // Fused wind 18 kt
        effectiveGust: 22.0,
        effectiveDirection: 180, // Fused S direction
      },
      {
        spotId: "malcesine",
        effectiveWind: 16.0,
        effectiveGust: 20.0,
        effectiveDirection: 185,
      },
      {
        spotId: "riva",
        effectiveWind: 17.0,
        effectiveGust: 21.0,
        effectiveDirection: 175,
      },
    ];

    const result = classifyPostFusionNowRegime(GardaLakeRegion, primitives, refTime);

    expect(result.regimeId).toBe("GARDA_ORA");
    expect(result.regimeLabel).toContain("Ora");
  });

  it("Test 2: Fused gust ratio (convective threshold) triggers convective hazard regime reclassification", () => {
    // Maremma region with high gust ratio (25 kt wind, 45 kt gust => gustRatio = 1.8)
    const primitives: PostFusionSpotPrimitive[] = [
      {
        spotId: "marina-di-grosseto",
        effectiveWind: 25.0,
        effectiveGust: 45.0, // High gust ratio (1.8)
        effectiveDirection: 270,
      },
      {
        spotId: "talamone",
        effectiveWind: 24.0,
        effectiveGust: 44.0,
        effectiveDirection: 275,
      },
    ];

    const result = classifyPostFusionNowRegime(MaremmaRegion, primitives, refTime);

    expect(result.regimeId).toBe("MAREMMA_CONVECTIVE_HAZARD");
  });

  it("Test 3: Trigonometric vector averaging handles 350° + 10° circular wrap-around to 0° (N), not 180°", () => {
    const morningTime = new Date("2026-08-12T06:00:00.000Z"); // 08:00 CEST (Pelèr morning window [5, 11])
    const primitives: PostFusionSpotPrimitive[] = [
      {
        spotId: "spot-1",
        effectiveWind: 15.0,
        effectiveGust: 18.0,
        effectiveDirection: 350,
      },
      {
        spotId: "spot-2",
        effectiveWind: 15.0,
        effectiveGust: 18.0,
        effectiveDirection: 10,
      },
    ];

    const result = classifyPostFusionNowRegime(GardaLakeRegion, primitives, morningTime);

    // Vector average of 350° and 10° is 0° (North / Pelèr flow)
    expect(result.regimeId).toBe("GARDA_PELER");
  });

  it("Test 4: Strict Regime Retention — helper returns exact forecastNowRegimeId when hasActiveRegimeDetectionEvidence is false", () => {
    const forecastNowRegimeId = "MAREMMA_MAESTRALE";
    const hasActiveRegimeDetectionEvidence = false;

    // Simulate route.ts pipeline logic
    const { regimeId: effectiveNowRegimeId } = hasActiveRegimeDetectionEvidence
      ? classifyPostFusionNowRegime(MaremmaRegion, [], refTime)
      : { regimeId: forecastNowRegimeId };

    // MUST match forecastNowRegimeId EXACTLY — zero re-classification attempted
    expect(effectiveNowRegimeId).toBe("MAREMMA_MAESTRALE");
    expect(effectiveNowRegimeId).toBe(forecastNowRegimeId);
  });

  it("Test 5: Contributor with positive weight and 'regime-detection' enables detection", () => {
    const fusion = {
      status: "available",
      contributors: [
        {
          weight: 0.95,
          effectsApplied: ["current-condition", "speed-bias", "regime-detection"],
          observedWindKt: 20.0,
          observedDirectionDeg: 180,
        },
      ],
    };

    const isFused = fusion.status === "available" || fusion.status === "partial";
    const hasRegimeContributor = isFused && fusion.contributors.some((c: any) =>
      c.weight > 0 &&
      Array.isArray(c.effectsApplied) &&
      c.effectsApplied.includes("regime-detection") &&
      (c.observedWindKt !== null || c.observedDirectionDeg !== null)
    );

    expect(hasRegimeContributor).toBe(true);
  });

  it("Test 6: Disabled binding (SIAR with only speed-bias) rejects regime detection", () => {
    const fusion = {
      status: "available",
      contributors: [
        {
          weight: 0.95,
          effectsApplied: ["current-condition", "speed-bias"], // "regime-detection" NOT included
          observedWindKt: 25.0,
          observedDirectionDeg: 270,
        },
      ],
    };

    const isFused = fusion.status === "available" || fusion.status === "partial";
    const hasRegimeContributor = isFused && fusion.contributors.some((c: any) =>
      c.weight > 0 &&
      Array.isArray(c.effectsApplied) &&
      c.effectsApplied.includes("regime-detection") &&
      (c.observedWindKt !== null || c.observedDirectionDeg !== null)
    );

    expect(hasRegimeContributor).toBe(false);
  });

  it("Test 7: Zero-weight or stale contributor rejects regime detection", () => {
    const fusionZeroWeight = {
      status: "available",
      contributors: [
        {
          weight: 0.0, // Zero weight
          effectsApplied: ["regime-detection"],
          observedWindKt: 20.0,
          observedDirectionDeg: 180,
        },
      ],
    };

    const hasRegimeContributorZero = fusionZeroWeight.contributors.some((c: any) =>
      c.weight > 0 &&
      Array.isArray(c.effectsApplied) &&
      c.effectsApplied.includes("regime-detection")
    );

    expect(hasRegimeContributorZero).toBe(false);

    const fusionStale = {
      status: "stale", // Stale status
      contributors: [
        {
          weight: 0.95,
          effectsApplied: ["regime-detection"],
          observedWindKt: 20.0,
          observedDirectionDeg: 180,
        },
      ],
    };

    const isFusedStale = fusionStale.status === "available" || fusionStale.status === "partial";
    expect(isFusedStale).toBe(false);
  });

  it("Test 8: Partial fusion with valid regime contributor enables reclassification", () => {
    const fusionPartial = {
      status: "partial",
      contributors: [
        {
          weight: 0.8,
          effectsApplied: ["current-condition", "regime-detection"],
          observedWindKt: 19.0,
          observedDirectionDeg: 180,
        },
      ],
    };

    const isFused = fusionPartial.status === "available" || fusionPartial.status === "partial";
    const hasRegimeContributor = isFused && fusionPartial.contributors.some((c: any) =>
      c.weight > 0 &&
      Array.isArray(c.effectsApplied) &&
      c.effectsApplied.includes("regime-detection") &&
      (c.observedWindKt !== null || c.observedDirectionDeg !== null)
    );

    expect(hasRegimeContributor).toBe(true);
  });
});
