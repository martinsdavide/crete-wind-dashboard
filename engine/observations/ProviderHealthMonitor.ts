import { WeatherObservation } from "./types";
import { StationRegistry } from "./StationRegistry";
import { ObservationQualityControl } from "./ObservationQualityControl";
import { COMO_LAKE_STATION_BINDINGS } from "./bindings/comoLakeBindings";
import { GARDA_LAKE_STATION_BINDINGS } from "./bindings/gardaLakeBindings";
import { LombardiaOpenDataAdapter } from "./providers/LombardiaOpenDataAdapter";
import { MeteotrentinoAdapter } from "./providers/MeteotrentinoAdapter";
import { MeteoSwissAdapter } from "./providers/MeteoSwissAdapter";

export type OverallHealthStatus = "healthy" | "degraded" | "unavailable";
export type StationHealthStatus = "fresh" | "suspect" | "stale" | "invalid" | "unavailable";

export interface StationHealthReport {
  stationId: string;
  providerStationId: string;
  name: string;
  status: StationHealthStatus;
  observedAt: string | null;
  ageMinutes: number | null;
  parseStatus: "valid" | "partial" | "failed" | "missing";
  qualityScore: number;
  qualityStatus: string;
  eligibleForFusion: boolean;
  boundSpotsCount: number;
  allowedEffects: string[];
  testLevels: {
    level1_connectivity: boolean;
    level2_parsing: boolean;
    level3_quality: boolean;
    level4_fusionEligibility: boolean;
    level5_engineConsumption: boolean;
  };
  latestValues?: {
    windSpeedKt: number | null;
    windGustKt: number | null;
    windDirectionDeg: number | null;
    temperatureC: number | null;
    pressureHpa: number | null;
    precipitationMm: number | null;
  };
}

export interface ProviderHealthReport {
  provider: string;
  displayName: string;
  status: OverallHealthStatus;
  responseTimeMs: number;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  errorCode?: string;
  errorMessage?: string;
  stations: StationHealthReport[];
}

export interface SystemHealthReport {
  generatedAt: string;
  status: OverallHealthStatus;
  providers: ProviderHealthReport[];
  summary: {
    totalProviders: number;
    healthyProviders: number;
    totalStations: number;
    freshStations: number;
    eligibleForFusionCount: number;
  };
}

export class ProviderHealthMonitor {
  private static lastSuccessMap: Map<string, string> = new Map();

  /**
   * Generates a complete live health evaluation across all providers and registered stations.
   */
  static async checkSystemHealth(
    referenceTime: Date = new Date(),
    requestId: string = `health_${Date.now()}`
  ): Promise<SystemHealthReport> {
    const allBindings = {
      ...COMO_LAKE_STATION_BINDINGS,
      ...GARDA_LAKE_STATION_BINDINGS,
    };

    // Calculate station bindings metadata
    const stationBindingsMeta: Record<string, { spots: string[]; effects: Set<string>; minMaxAge: number }> = {};
    for (const [spotId, bList] of Object.entries(allBindings)) {
      for (const b of bList) {
        if (!stationBindingsMeta[b.stationId]) {
          stationBindingsMeta[b.stationId] = {
            spots: [],
            effects: new Set(),
            minMaxAge: b.maxAgeMinutes,
          };
        }
        stationBindingsMeta[b.stationId].spots.push(spotId);
        b.allowedEffects.forEach((e) => stationBindingsMeta[b.stationId].effects.add(e));
        stationBindingsMeta[b.stationId].minMaxAge = Math.min(
          stationBindingsMeta[b.stationId].minMaxAge,
          b.maxAgeMinutes
        );
      }
    }

    const providersReport: ProviderHealthReport[] = [];

    // --- 1. Regione Lombardia ---
    const lombardiaStart = Date.now();
    let lombardiaStatus: OverallHealthStatus = "unavailable";
    let lombardiaError: string | undefined;
    let lombardiaErrorCode: string | undefined;
    let lombardiaObs: Record<string, WeatherObservation | null> = {};

    try {
      lombardiaObs = await LombardiaOpenDataAdapter.fetchLatestObservations(
        { "573": "lombardia:colico", "679": "lombardia:valmadrera" },
        referenceTime,
        3000,
        requestId
      );
    } catch (e: any) {
      lombardiaError = e?.message || "Connection failed";
      lombardiaErrorCode = "PROVIDER_HTTP_ERROR";
    }
    const lombardiaDuration = Date.now() - lombardiaStart;

    const lombardiaStationIds = ["lombardia:colico", "lombardia:valmadrera"];
    const lombardiaStationReports = lombardiaStationIds.map((stId) =>
      this.evaluateStationHealth(stId, lombardiaObs[stId] || null, stationBindingsMeta[stId], referenceTime)
    );

    const lombardiaAnySuccess = lombardiaStationReports.some((s) => s.testLevels.level1_connectivity);
    const lombardiaAllFresh = lombardiaStationReports.every((s) => s.status === "fresh");

    if (lombardiaAllFresh) {
      lombardiaStatus = "healthy";
      this.lastSuccessMap.set("regione-lombardia", referenceTime.toISOString());
    } else if (lombardiaAnySuccess) {
      lombardiaStatus = "degraded";
      this.lastSuccessMap.set("regione-lombardia", referenceTime.toISOString());
    } else {
      lombardiaStatus = "unavailable";
      lombardiaErrorCode = lombardiaErrorCode || "PROVIDER_TIMEOUT";
      lombardiaError = lombardiaError || "No station observations retrieved";
    }

    providersReport.push({
      provider: "regione-lombardia",
      displayName: "Regione Lombardia / ARPA Open Data",
      status: lombardiaStatus,
      responseTimeMs: lombardiaDuration,
      lastAttemptAt: referenceTime.toISOString(),
      lastSuccessAt: this.lastSuccessMap.get("regione-lombardia") || null,
      errorCode: lombardiaStatus === "healthy" ? undefined : lombardiaErrorCode,
      errorMessage: lombardiaStatus === "healthy" ? undefined : lombardiaError,
      stations: lombardiaStationReports,
    });

    // --- 2. Meteotrentino ---
    const trentinoStart = Date.now();
    let trentinoStatus: OverallHealthStatus = "unavailable";
    let trentinoError: string | undefined;
    let trentinoErrorCode: string | undefined;
    let trentinoObs: Record<string, WeatherObservation | null> = {};

    try {
      trentinoObs = await MeteotrentinoAdapter.fetchLatestObservations(
        ["T0193", "T0401", "T0354"],
        referenceTime,
        3000,
        requestId
      );
    } catch (e: any) {
      trentinoError = e?.message || "Connection failed";
      trentinoErrorCode = "PROVIDER_HTTP_ERROR";
    }
    const trentinoDuration = Date.now() - trentinoStart;

    const trentinoStationIds = ["meteotrentino:T0193", "meteotrentino:T0401", "meteotrentino:T0354"];
    const trentinoStationReports = trentinoStationIds.map((stId) =>
      this.evaluateStationHealth(stId, trentinoObs[stId] || null, stationBindingsMeta[stId], referenceTime)
    );

    const trentinoAnySuccess = trentinoStationReports.some((s) => s.testLevels.level1_connectivity);
    const trentinoAllFresh = trentinoStationReports.every((s) => s.status === "fresh");

    if (trentinoAllFresh) {
      trentinoStatus = "healthy";
      this.lastSuccessMap.set("meteotrentino", referenceTime.toISOString());
    } else if (trentinoAnySuccess) {
      trentinoStatus = "degraded";
      this.lastSuccessMap.set("meteotrentino", referenceTime.toISOString());
    } else {
      trentinoStatus = "unavailable";
      trentinoErrorCode = trentinoErrorCode || "PROVIDER_TIMEOUT";
      trentinoError = trentinoError || "No station observations retrieved";
    }

    providersReport.push({
      provider: "meteotrentino",
      displayName: "Meteotrentino Open Data (Trentino-Alto Adige)",
      status: trentinoStatus,
      responseTimeMs: trentinoDuration,
      lastAttemptAt: referenceTime.toISOString(),
      lastSuccessAt: this.lastSuccessMap.get("meteotrentino") || null,
      errorCode: trentinoStatus === "healthy" ? undefined : trentinoErrorCode,
      errorMessage: trentinoStatus === "healthy" ? undefined : trentinoError,
      stations: trentinoStationReports,
    });

    // --- 3. MeteoSwiss ---
    const swissStart = Date.now();
    let swissStatus: OverallHealthStatus = "unavailable";
    let swissError: string | undefined;
    let swissErrorCode: string | undefined;
    let swissObs: Record<string, WeatherObservation | null> = {};

    try {
      swissObs = await MeteoSwissAdapter.fetchLatestObservations(
        { SBO: "meteoswiss:san_bernardino" },
        referenceTime,
        3000,
        requestId
      );
    } catch (e: any) {
      swissError = e?.message || "Connection failed";
      swissErrorCode = "PROVIDER_HTTP_ERROR";
    }
    const swissDuration = Date.now() - swissStart;

    const swissStationIds = ["meteoswiss:san_bernardino"];
    const swissStationReports = swissStationIds.map((stId) =>
      this.evaluateStationHealth(stId, swissObs[stId] || null, stationBindingsMeta[stId], referenceTime)
    );

    const swissAnySuccess = swissStationReports.some((s) => s.testLevels.level1_connectivity);
    const swissAllFresh = swissStationReports.every((s) => s.status === "fresh");

    if (swissAllFresh) {
      swissStatus = "healthy";
      this.lastSuccessMap.set("meteoswiss", referenceTime.toISOString());
    } else if (swissAnySuccess) {
      swissStatus = "degraded";
      this.lastSuccessMap.set("meteoswiss", referenceTime.toISOString());
    } else {
      swissStatus = "unavailable";
      swissErrorCode = swissErrorCode || "PROVIDER_TIMEOUT";
      swissError = swissError || "No station observations retrieved";
    }

    providersReport.push({
      provider: "meteoswiss",
      displayName: "MeteoSwiss GeoAdmin Open Data",
      status: swissStatus,
      responseTimeMs: swissDuration,
      lastAttemptAt: referenceTime.toISOString(),
      lastSuccessAt: this.lastSuccessMap.get("meteoswiss") || null,
      errorCode: swissStatus === "healthy" ? undefined : swissErrorCode,
      errorMessage: swissStatus === "healthy" ? undefined : swissError,
      stations: swissStationReports,
    });

    // Overall System Status
    const totalProviders = providersReport.length;
    const healthyProviders = providersReport.filter((p) => p.status === "healthy").length;
    const unavailableProviders = providersReport.filter((p) => p.status === "unavailable").length;

    let systemStatus: OverallHealthStatus = "healthy";
    if (unavailableProviders === totalProviders) {
      systemStatus = "unavailable";
    } else if (healthyProviders < totalProviders || providersReport.some((p) => p.status === "degraded")) {
      systemStatus = "degraded";
    }

    const allStations = providersReport.flatMap((p) => p.stations);
    const freshStations = allStations.filter((s) => s.status === "fresh").length;
    const eligibleForFusionCount = allStations.filter((s) => s.eligibleForFusion).length;

    return {
      generatedAt: referenceTime.toISOString(),
      status: systemStatus,
      providers: providersReport,
      summary: {
        totalProviders,
        healthyProviders,
        totalStations: allStations.length,
        freshStations,
        eligibleForFusionCount,
      },
    };
  }

  private static evaluateStationHealth(
    stationId: string,
    obs: WeatherObservation | null,
    bindingMeta: { spots: string[]; effects: Set<string>; minMaxAge: number } | undefined,
    referenceTime: Date
  ): StationHealthReport {
    const station = StationRegistry.getStation(stationId);
    const providerStationId = station?.providerStationId || stationId;
    const name = station?.name || stationId;

    const boundSpotsCount = bindingMeta?.spots.length || 0;
    const allowedEffects = bindingMeta ? Array.from(bindingMeta.effects) : [];
    const maxAllowedAge = bindingMeta?.minMaxAge || 45;

    if (!obs) {
      return {
        stationId,
        providerStationId,
        name,
        status: "unavailable",
        observedAt: null,
        ageMinutes: null,
        parseStatus: "missing",
        qualityScore: 0,
        qualityStatus: "missing",
        eligibleForFusion: false,
        boundSpotsCount,
        allowedEffects,
        testLevels: {
          level1_connectivity: false,
          level2_parsing: false,
          level3_quality: false,
          level4_fusionEligibility: false,
          level5_engineConsumption: false,
        },
      };
    }

    const { ageMinutes, freshnessFactor, status: freshnessStatus } =
      ObservationQualityControl.evaluateFreshness(obs.observedAt, referenceTime);

    const level1_connectivity = true;
    const level2_parsing = true;
    const level3_quality = obs.quality.status === "valid" || obs.quality.status === "suspect";
    const level4_fusionEligibility =
      level3_quality && ageMinutes <= maxAllowedAge && freshnessFactor > 0 && boundSpotsCount > 0;
    const level5_engineConsumption = level4_fusionEligibility;

    let status: StationHealthStatus = "unavailable";
    if (obs.quality.status === "invalid") {
      status = "invalid";
    } else if (freshnessStatus === "missing") {
      status = "unavailable";
    } else if (freshnessStatus === "stale" || ageMinutes > maxAllowedAge) {
      status = "stale";
    } else if (freshnessStatus === "suspect" || obs.quality.status === "suspect") {
      status = "suspect";
    } else {
      status = "fresh";
    }

    return {
      stationId,
      providerStationId,
      name,
      status,
      observedAt: obs.observedAt,
      ageMinutes,
      parseStatus: "valid",
      qualityScore: obs.quality.score,
      qualityStatus: obs.quality.status,
      eligibleForFusion: level4_fusionEligibility,
      boundSpotsCount,
      allowedEffects,
      testLevels: {
        level1_connectivity,
        level2_parsing,
        level3_quality,
        level4_fusionEligibility,
        level5_engineConsumption,
      },
      latestValues: {
        windSpeedKt: obs.windSpeedMs !== null ? Math.round(obs.windSpeedMs * 1.94384 * 10) / 10 : null,
        windGustKt: obs.windGustMs !== null ? Math.round(obs.windGustMs * 1.94384 * 10) / 10 : null,
        windDirectionDeg: obs.windDirectionDeg,
        temperatureC: obs.temperatureC,
        pressureHpa: obs.pressureHpa,
        precipitationMm: obs.precipitationMm,
      },
    };
  }
}
