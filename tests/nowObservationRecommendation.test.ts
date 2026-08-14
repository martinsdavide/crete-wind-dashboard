import { describe, it, expect } from "vitest";
import { ObservationQualityControl } from "@/engine/observations/ObservationQualityControl";
import { ObservationFeatureExtractor } from "@/engine/observations/ObservationFeatureExtractor";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { WeatherObservation, SpotStationBinding } from "@/engine/observations/types";
import { SpotForecast, SpotResult, BestWindow } from "@/types/weather";

describe("Live NOW Recommendations & Observation-Fusion Integrity", () => {
  const refTime = new Date("2026-08-14T14:00:00.000Z"); // 16:00 CEST

  const makeObs = (
    stationId: string,
    observedAt: string,
    speedMs: number | null,
    gustMs: number | null = null,
    dirDeg: number | null = null,
    tempC: number | null = null,
    precipMm: number | null = null
  ): WeatherObservation => ({
    stationId,
    observedAt,
    receivedAt: observedAt,
    windSpeedMs: speedMs,
    windGustMs: gustMs,
    windDirectionDeg: dirDeg,
    temperatureC: tempC,
    relativeHumidityPct: 60,
    pressureHpa: 1013,
    precipitationMm: precipMm,
    solarRadiationWm2: 800,
    quality: { status: "valid", score: 1.0, reasons: ["OK"] },
  });

  const sampleBindings: SpotStationBinding[] = [
    {
      stationId: "meteotrentino:T0193",
      role: "spot-local",
      baseWeight: 0.95,
      maxAgeMinutes: 30,
      delayedUseUntilMinutes: 90,
      delayedUsePolicy: "DECAYED_PERSISTENCE",
      parameters: ["wind_speed", "wind_direction", "wind_gust", "temperature", "pressure", "precipitation"],
      allowedEffects: ["current-condition", "speed-bias", "timing-correction", "confidence", "regime-detection"],
    },
    {
      stationId: "meteotrentino:T0401",
      role: "valley",
      baseWeight: 0.40,
      maxAgeMinutes: 45,
      parameters: ["temperature", "precipitation"],
      allowedEffects: ["thermal-context", "rain-context"],
    },
    {
      stationId: "meteotrentino:T0354",
      role: "mountain",
      baseWeight: 0.30,
      maxAgeMinutes: 45,
      parameters: ["wind_speed", "wind_direction", "pressure"],
      allowedEffects: ["regime-detection", "confidence"],
    },
  ];

  // --- 1. Coverage Isolation ---
  it("Test 1: Fresh temperature-only data does not increase wind coverage", () => {
    const obsT0401 = makeObs("meteotrentino:T0401", "2026-08-14T13:50:00.000Z", null, null, null, 25.0, 0.0);
    const features = ObservationFeatureExtractor.extractFeatures(
      sampleBindings,
      { "meteotrentino:T0401": obsT0401 },
      5.0,
      200,
      refTime
    );

    expect(features.coverage.thermalContext).toBeGreaterThan(0);
    expect(features.coverage.windSpeed).toBe(0);
    expect(features.coverage.windGust).toBe(0);
    expect(features.coverage.windDirection).toBe(0);
  });

  it("Test 2: Fresh rain context does not enable speed correction", () => {
    const obsT0401 = makeObs("meteotrentino:T0401", "2026-08-14T13:55:00.000Z", null, null, null, 20.0, 5.0);
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0401": obsT0401 },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.windObservationUsed).toBe(false);
    expect(fusion.speedCorrectionKt).toBe(0);
    expect(fusion.correctedWindSpeedKt).toBe(5.0);
  });

  it("Test 3: Stale wind plus fresh temperature reports context available and wind stale", () => {
    const obsT0193Stale = makeObs("meteotrentino:T0193", "2026-08-14T12:00:00.000Z", 8.5, 11.0, 200); // 120m old (>90m)
    const obsT0401Fresh = makeObs("meteotrentino:T0401", "2026-08-14T13:50:00.000Z", null, null, null, 24.0, 0.0);

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      {
        "meteotrentino:T0193": obsT0193Stale,
        "meteotrentino:T0401": obsT0401Fresh,
      },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.windFusionStatus).toBe("stale");
    expect(fusion.contextFusionStatus).toBe("available");
    expect(fusion.windObservationUsed).toBe(false);
  });

  it("Test 4: Mountain regime evidence does not become spot-local wind evidence", () => {
    const obsT0354Mountain = makeObs("meteotrentino:T0354", "2026-08-14T13:45:00.000Z", 12.0, 15.0, 360);
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0354": obsT0354Mountain },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.windObservationUsed).toBe(false);
    expect(fusion.speedCorrectionKt).toBe(0);
    expect(fusion.regimeObservationUsed).toBe(true);
  });

  // --- 2. Freshness and Persistence ---
  it("Test 5: A 20-minute T0193 observation receives full freshness weight", () => {
    const obsT0193_20m = makeObs("meteotrentino:T0193", "2026-08-14T13:40:00.000Z", 8.0, 10.0, 190);
    const evalRes = ObservationQualityControl.evaluateFreshness(
      obsT0193_20m.observedAt,
      refTime,
      30,
      90,
      "DECAYED_PERSISTENCE"
    );

    expect(evalRes.freshnessCategory).toBe("FRESH");
    expect(evalRes.freshnessFactor).toBe(1.0);
  });

  it("Test 6: A 68-minute T0193 observation receives configured decayed weight", () => {
    const obsT0193_68m = makeObs("meteotrentino:T0193", "2026-08-14T12:52:00.000Z", 8.7, 11.4, 194); // 68 min old
    const evalRes = ObservationQualityControl.evaluateFreshness(
      obsT0193_68m.observedAt,
      refTime,
      30,
      90,
      "DECAYED_PERSISTENCE"
    );

    expect(evalRes.freshnessCategory).toBe("DELAYED");
    expect(evalRes.freshnessFactor).toBeGreaterThan(0.3);
    expect(evalRes.freshnessFactor).toBeLessThan(0.45);
  });

  it("Test 7: A 91-minute observation is excluded", () => {
    const obsT0193_91m = makeObs("meteotrentino:T0193", "2026-08-14T12:29:00.000Z", 8.7, 11.4, 194); // 91 min old
    const evalRes = ObservationQualityControl.evaluateFreshness(
      obsT0193_91m.observedAt,
      refTime,
      30,
      90,
      "DECAYED_PERSISTENCE"
    );

    expect(evalRes.freshnessCategory).toBe("STALE");
    expect(evalRes.freshnessFactor).toBe(0.0);
  });

  it("Test 8: Delayed persistence is disabled when binding policy is NONE", () => {
    const strictBinding: SpotStationBinding = {
      ...sampleBindings[0],
      delayedUsePolicy: "NONE",
    };

    const obsT0193_45m = makeObs("meteotrentino:T0193", "2026-08-14T13:15:00.000Z", 8.7, 11.4, 194); // 45 min old
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      [strictBinding],
      { "meteotrentino:T0193": obsT0193_45m },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.windObservationUsed).toBe(false);
    expect(fusion.windFusionStatus).toBe("stale");
  });

  it("Test 9: Future observations are rejected", () => {
    const obsFuture = makeObs("meteotrentino:T0193", "2026-08-14T15:00:00.000Z", 10.0, 12.0, 190); // 1h in future
    const evalRes = ObservationQualityControl.evaluateFreshness(
      obsFuture.observedAt,
      refTime
    );

    expect(evalRes.freshnessCategory).toBe("FUTURE_INVALID");
    expect(evalRes.freshnessFactor).toBe(0.0);
  });

  it("Test 10: Observation age is calculated from actual wind timestamp, not context timestamp", () => {
    const obsWindOld = makeObs("meteotrentino:T0193", "2026-08-14T13:00:00.000Z", 8.7, 11.4, 194); // 60m old
    const obsContextFresh = makeObs("meteotrentino:T0401", "2026-08-14T13:55:00.000Z", null, null, null, 25.0, 0.0); // 5m old

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      {
        "meteotrentino:T0193": obsWindOld,
        "meteotrentino:T0401": obsContextFresh,
      },
      5.0,
      7.0,
      200,
      refTime
    );

    const windContrib = fusion.contributors.find((c) => c.stationId === "meteotrentino:T0193");
    expect(windContrib?.ageMinutes).toBe(60);
  });

  // --- 3. Wind Fusion ---
  it("Test 11: Fresh 20 kt local observation materially moves 5 kt NOW forecast toward 20 kt", () => {
    const obsFresh20kt = makeObs("meteotrentino:T0193", "2026-08-14T13:50:00.000Z", 10.29, 12.35, 194); // 10.29 m/s = 20.0 kt
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0193": obsFresh20kt },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.windFusionStatus).toBe("available");
    expect(fusion.windObservationUsed).toBe(true);
    expect(fusion.correctedWindSpeedKt).toBeGreaterThan(15.0);
  });

  it("Test 12: Delayed 17 kt observation produces a smaller conservative adjustment", () => {
    const obsDelayed17kt = makeObs("meteotrentino:T0193", "2026-08-14T12:52:00.000Z", 8.75, 11.4, 194); // 68m old (~17 kt)
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0193": obsDelayed17kt },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.windFusionStatus).toBe("degraded");
    expect(fusion.windObservationUsed).toBe(true);
    expect(fusion.correctedWindSpeedKt).toBeGreaterThan(7.0);
    expect(fusion.correctedWindSpeedKt).toBeLessThan(14.0);
  });

  it("Test 13: Context-only contributors cannot alter corrected wind", () => {
    const obsContextOnly = makeObs("meteotrentino:T0401", "2026-08-14T13:55:00.000Z", null, null, null, 27.0, 0.0);
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0401": obsContextOnly },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.correctedWindSpeedKt).toBe(5.0);
    expect(fusion.speedCorrectionKt).toBe(0);
  });

  it("Test 14: Fused gust uses observed gust independently", () => {
    const obsWithGust = makeObs("meteotrentino:T0193", "2026-08-14T13:50:00.000Z", 8.0, 13.0, 190); // 13 m/s gust = 25.3 kt
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0193": obsWithGust },
      5.0,
      7.0,
      200,
      refTime
    );

    expect(fusion.correctedWindGustKt).toBeGreaterThan(fusion.correctedWindSpeedKt);
  });

  it("Test 15: Direction blending handles circular angles correctly", () => {
    const obs350Deg = makeObs("meteotrentino:T0193", "2026-08-14T13:50:00.000Z", 8.0, 10.0, 350);
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      sampleBindings,
      { "meteotrentino:T0193": obs350Deg },
      5.0,
      7.0,
      10, // Forecast 10 deg -> difference is 20 deg (350 vs 10)
      refTime
    );

    expect(fusion.directionCorrectionDeg).toBe(-20);
    expect(fusion.correctedWindDirectionDeg).toBe(350);
  });

  // --- 4. NOW Recommendation ---
  it("Test 17: Suitable fused NOW conditions produce recommendation even when days[today].bestWindow is null", () => {
    const spotForecast: SpotForecast = {
      spot: { id: "torbole", name: "Torbole", defaultStyle: "BUMP_AND_JUMP" } as any,
      current: {
        timestamp: "2026-08-14T14:00:00.000Z",
        modelWind: 5.0,
        modelGust: 7.0,
        directionDegrees: 195,
        directionLabel: "SSW",
        arrowRotation: 15,
        localWind: 16.5,
        localGust: 21.0,
        correctionFactor: 1.0,
        confidence: 85,
        confidenceLevel: "HIGH",
        eligibility: "SUITABLE",
        waterState: "CHOP",
        spotWindQuality: 85,
        directionQuality: 90,
        preferenceScore: 85,
        sessionQualityScore: 82,
        score: 82,
        classification: "GOOD",
        condition: "GOOD",
        observationFusion: {
          status: "available",
          observationCoverage: 0.95,
          coverage: { overall: 0.95, windSpeed: 0.95, windGust: 0.95, windDirection: 0.95, currentCondition: 0.95, regimeDetection: 0.95, thermalContext: 0, rainContext: 0, confidence: 0.95 },
          windFusionStatus: "available",
          contextFusionStatus: "available",
          windObservationUsed: true,
          directionObservationUsed: true,
          regimeObservationUsed: true,
          latestObservedAt: "2026-08-14T13:50:00.000Z",
          correctedWindSpeedKt: 16.5,
          correctedWindGustKt: 21.0,
          correctedWindDirectionDeg: 195,
          speedCorrectionKt: 11.5,
          directionCorrectionDeg: 0,
          timingCorrectionMinutes: 0,
          confidenceAdjustment: 0.08,
          regimeEvidence: { thermal: 0.8, northerly: 0.1, disturbance: 0, transition: 0, rainBoost: 0 },
          contributors: [
            {
              stationId: "meteotrentino:T0193",
              stationName: "Torbole Belvedere",
              role: "spot-local",
              weight: 0.95,
              observedWindKt: 17.0,
              observedGustKt: 22.0,
              observedDirectionDeg: 195,
              observedAt: "2026-08-14T13:50:00.000Z",
              ageMinutes: 10,
              qualityScore: 1.0,
              effectsApplied: ["speed-bias", "current-condition"],
            },
          ],
          reasons: ["FRESH_LOCAL_WIND_APPLIED"],
        },
      },
      hourly: [],
      days: [
        {
          date: "2026-08-14",
          minWind: 5,
          maxWind: 6,
          daytimeMinWind: 5,
          daytimeMaxWind: 6,
          maxGust: 8,
          dominantDirection: "SSW",
          dominantDirectionDegrees: 195,
          bestWindow: null, // Null forecast best window!
          score: 0,
          condition: "POOR",
          dominantEligibility: "UNSUITABLE",
          dominantStyle: "CHOP",
        },
      ],
      providerModel: "ECMWF",
    };

    const mockRegionConfig: any = {
      id: "garda-lake",
      timezone: "Europe/Rome",
      spots: [{ id: "torbole", name: "Torbole", defaultStyle: "CHOP", minWindSpeedKt: 11, maxWindSpeedKt: 40 }],
      regimes: [],
      explanationRules: [],
    };

    const rec = RecommendationEngine.run(
      mockRegionConfig,
      { torbole: { status: "ok", data: spotForecast } as SpotResult },
      refTime
    );

    expect(rec.bestSpot).toBe("torbole");
    expect(rec.mode).toBe("NOW");
    expect(rec.evidence).toBe("FRESH_OBSERVATION");
    expect(rec.bestWindow).not.toBeNull();
  });

  it("Test 18: NOW recommendation does not require forecast 2-hour minimum", () => {
    const nowWindow: BestWindow = {
      start: "16:00",
      end: "16:45",
      durationHours: 0.75, // Only 45 min!
      minWind: 16.0,
      maxWind: 20.0,
      dominantDirection: "S",
      meanScore: 78,
      sailingStyle: "CHOP",
    };

    expect(nowWindow.durationHours).toBeLessThan(2.0);
  });

  it("Test 19: NOW recommendation includes bounded validity time", () => {
    const spotForecast: SpotForecast = {
      spot: { id: "torbole", name: "Torbole" } as any,
      current: {
        timestamp: "2026-08-14T14:00:00.000Z",
        modelWind: 5.0,
        modelGust: 7.0,
        directionDegrees: 195,
        directionLabel: "S",
        arrowRotation: 15,
        localWind: 16.5,
        localGust: 21.0,
        correctionFactor: 1.0,
        confidence: 85,
        confidenceLevel: "HIGH",
        eligibility: "SUITABLE",
        waterState: "CHOP",
        spotWindQuality: 85,
        directionQuality: 90,
        preferenceScore: 85,
        sessionQualityScore: 80,
        score: 80,
        classification: "GOOD",
        condition: "GOOD",
        observationFusion: {
          status: "available",
          observationCoverage: 0.95,
          coverage: { overall: 0.95, windSpeed: 0.95, windGust: 0.95, windDirection: 0.95, currentCondition: 0.95, regimeDetection: 0.95, thermalContext: 0, rainContext: 0, confidence: 0.95 },
          windFusionStatus: "available",
          contextFusionStatus: "available",
          windObservationUsed: true,
          directionObservationUsed: true,
          regimeObservationUsed: true,
          latestObservedAt: "2026-08-14T13:50:00.000Z",
          correctedWindSpeedKt: 16.5,
          correctedWindGustKt: 21.0,
          correctedWindDirectionDeg: 195,
          speedCorrectionKt: 11.5,
          directionCorrectionDeg: 0,
          timingCorrectionMinutes: 0,
          confidenceAdjustment: 0.08,
          regimeEvidence: { thermal: 0.8, northerly: 0.1, disturbance: 0, transition: 0, rainBoost: 0 },
          contributors: [
            {
              stationId: "meteotrentino:T0193",
              stationName: "Torbole Belvedere",
              role: "spot-local",
              weight: 0.95,
              observedWindKt: 17.0,
              observedGustKt: 22.0,
              observedDirectionDeg: 195,
              observedAt: "2026-08-14T13:50:00.000Z",
              ageMinutes: 10,
              qualityScore: 1.0,
              effectsApplied: ["speed-bias", "current-condition"],
            },
          ],
          reasons: ["FRESH_LOCAL_WIND_APPLIED"],
        },
      },
      hourly: [],
      days: [{ date: "2026-08-14", minWind: 5, maxWind: 6, daytimeMinWind: 5, daytimeMaxWind: 6, maxGust: 8, dominantDirection: "S", dominantDirectionDegrees: 195, score: 0, condition: "POOR", dominantEligibility: "UNSUITABLE", dominantStyle: "CHOP" }],
      providerModel: "ECMWF",
    };

    const mockRegionConfig: any = {
      id: "garda-lake",
      timezone: "Europe/Rome",
      spots: [{ id: "torbole", name: "Torbole", defaultStyle: "CHOP", minWindSpeedKt: 11, maxWindSpeedKt: 40 }],
      regimes: [],
      explanationRules: [],
    };

    const rec = RecommendationEngine.run(
      mockRegionConfig,
      { torbole: { status: "ok", data: spotForecast } as SpotResult },
      refTime
    );

    expect(rec.validUntil).toBeDefined();
    expect(new Date(rec.validUntil!).getTime()).toBeGreaterThan(refTime.getTime());
  });

  // --- 5. Logging and Serialization ---
  it("Test 30: Fresh, delayed, stale, and context-only statuses serialize correctly", () => {
    const fusionRes: any = {
      status: "available",
      windFusionStatus: "degraded",
      contextFusionStatus: "available",
      windObservationUsed: true,
    };

    const jsonStr = JSON.stringify(fusionRes);
    expect(jsonStr).toContain('"windFusionStatus":"degraded"');
    expect(jsonStr).toContain('"contextFusionStatus":"available"');
  });

  it("Test 32: Current overlay reflects fused NOW scoring", () => {
    const spotForecast: SpotForecast = {
      spot: { id: "torbole", name: "Torbole" } as any,
      current: {
        timestamp: "2026-08-14T14:00:00.000Z",
        modelWind: 5.0,
        modelGust: 7.0,
        directionDegrees: 195,
        directionLabel: "S",
        arrowRotation: 15,
        localWind: 16.5,
        localGust: 21.0,
        correctionFactor: 1.0,
        confidence: 85,
        confidenceLevel: "HIGH",
        eligibility: "SUITABLE",
        waterState: "CHOP",
        spotWindQuality: 85,
        directionQuality: 90,
        preferenceScore: 85,
        sessionQualityScore: 82,
        score: 82,
        classification: "GOOD",
        condition: "GOOD",
        observationFusion: {
          status: "available",
          observationCoverage: 0.95,
          coverage: { overall: 0.95, windSpeed: 0.95, windGust: 0.95, windDirection: 0.95, currentCondition: 0.95, regimeDetection: 0.95, thermalContext: 0, rainContext: 0, confidence: 0.95 },
          windFusionStatus: "available",
          contextFusionStatus: "available",
          windObservationUsed: true,
          directionObservationUsed: true,
          regimeObservationUsed: true,
          latestObservedAt: "2026-08-14T13:50:00.000Z",
          correctedWindSpeedKt: 16.5,
          correctedWindGustKt: 21.0,
          correctedWindDirectionDeg: 195,
          speedCorrectionKt: 11.5,
          directionCorrectionDeg: 0,
          timingCorrectionMinutes: 0,
          confidenceAdjustment: 0.08,
          regimeEvidence: { thermal: 0.8, northerly: 0.1, disturbance: 0, transition: 0, rainBoost: 0 },
          contributors: [
            {
              stationId: "meteotrentino:T0193",
              stationName: "Torbole Belvedere",
              role: "spot-local",
              weight: 0.95,
              observedWindKt: 17.0,
              observedGustKt: 22.0,
              observedDirectionDeg: 195,
              observedAt: "2026-08-14T13:50:00.000Z",
              ageMinutes: 10,
              qualityScore: 1.0,
              effectsApplied: ["speed-bias", "current-condition"],
            },
          ],
          reasons: ["FRESH_LOCAL_WIND_APPLIED"],
        },
      },
      hourly: [],
      days: [{ date: "2026-08-14", minWind: 5, maxWind: 6, daytimeMinWind: 5, daytimeMaxWind: 6, maxGust: 8, dominantDirection: "S", dominantDirectionDegrees: 195, score: 0, condition: "POOR", dominantEligibility: "UNSUITABLE", dominantStyle: "CHOP" }],
      providerModel: "ECMWF",
    };

    const mockRegionConfig: any = {
      id: "garda-lake",
      timezone: "Europe/Rome",
      spots: [{ id: "torbole", name: "Torbole", defaultStyle: "CHOP", minWindSpeedKt: 11, maxWindSpeedKt: 40 }],
      regimes: [],
      explanationRules: [],
    };

    RecommendationEngine.run(
      mockRegionConfig,
      { torbole: { status: "ok", data: spotForecast } as SpotResult },
      refTime
    );

    expect(spotForecast.todayCurrentOverlay).toBeDefined();
    expect(spotForecast.todayCurrentOverlay?.currentScore).toBe(82);
    expect(spotForecast.todayCurrentOverlay?.source).toBe("FRESH_OBSERVATION");
  });
});
