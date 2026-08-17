export type WeatherErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_QUERY_ERROR"
  | "PROVIDER_SCHEMA_CHANGED"
  | "PROVIDER_PARSE_ERROR"
  | "STATION_NOT_FOUND"
  | "SENSOR_NOT_FOUND"
  | "OBSERVATION_STALE"
  | "OBSERVATION_INVALID"
  | "CACHE_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE";

export interface LogProviderRequest {
  event: "weather_provider_request";
  provider: string;
  stationId?: string;
  requestId: string;
  startedAt: string;
}

export interface LogProviderSuccess {
  event: "weather_provider_success";
  provider: string;
  stationId: string;
  httpStatus: number;
  responseTimeMs: number;
  observedAt: string;
  ageMinutes: number;
  parseStatus: "valid" | "partial" | "failed";
  qualityStatus: string;
  qualityScore: number;
  requestId?: string;
}

export interface LogProviderFailure {
  event: "weather_provider_failure";
  provider: string;
  stationId?: string;
  httpStatus?: number;
  responseTimeMs?: number;
  errorCode: WeatherErrorCode;
  error: string;
  requestId?: string;
}

export interface LogFusionResult {
  event: "weather_fusion_result";
  region: string;
  spotId: string;
  status: "available" | "partial" | "stale" | "unavailable" | "conflicting";
  contributors: string[];
  observationCoverage: number;
  rawWindKt: number;
  adjustedWindKt: number;
  speedCorrectionKt: number;
  confidenceAdjustment: number;
  requestId?: string;
}

export type WeatherInputType =
  | "fresh-observation-adjusted"
  | "delayed-observation-adjusted"
  | "observation-context-only"
  | "stale-observation-ignored"
  | "forecast-only";

export interface LogRecommendationEvaluated {
  event: "recommendation_evaluated";
  region: string;
  spotId: string;
  mode?: string;
  weatherInput: WeatherInputType | "observation-adjusted" | "forecast-only";
  forecastWindKt?: number;
  observedWindKt?: number;
  effectiveWindKt?: number;
  nowScore?: number;
  forecastDailyScore?: number;
  observationAgeMinutes?: number;
  validUntil?: string;
  windKtUsedForScore?: number;
  observationFusionStatus?: string;
  requestId?: string;
}

export interface LogProviderResult {
  event: "weather_provider_result";
  provider: string;
  stationId: string;
  status: string;
  httpStatus: number;
  recordsReceived?: number;
  selectedObservedAt: string | null;
  ageMinutes: number | null;
  hasWindSpeed: boolean;
  hasWindGust: boolean;
  hasDirection: boolean;
  responseTimeMs: number;
  errorCode?: string;
  requestId?: string;
}

export interface LogThermalEvaluation {
  event: "thermal_evaluation";
  requestId?: string;
  regionId?: string;
  spotId: string;
  timestamp: string;
  regimeId?: string;
  modelWindKt: number;
  baseCorrectedWindKt: number;
  requestedThermalBoostKt?: number;
  appliedThermalBoostKt?: number;
  thermalState: "ABSENT" | "BUILDING" | "ACTIVE" | "DECAYING" | "UNKNOWN";
  thermalStrength: number;
  thermalConfidence: number;
  preObservationLocalWindKt?: number;
  observationConfidenceAdjustment?: number;
  finalLocalWindKt: number;
  limitingFactors?: string[];
  reasonCodes?: string[];
}

export type StructuredWeatherLog =
  | LogProviderRequest
  | LogProviderSuccess
  | LogProviderFailure
  | LogProviderResult
  | LogFusionResult
  | LogRecommendationEvaluated
  | LogThermalEvaluation;

export class ObservationLogger {
  private static isTestEnv = process.env.NODE_ENV === "test";

  static log(data: StructuredWeatherLog) {
    const jsonStr = JSON.stringify(data);
    if (!this.isTestEnv) {
      console.log(jsonStr);
    }
  }

  static logThermalEvaluation(data: Omit<LogThermalEvaluation, "event">) {
    this.log({
      event: "thermal_evaluation",
      ...data,
    });
  }

  static logEvent(data: LogProviderResult) {
    this.log(data);
  }

  static logRequest(provider: string, requestId: string, stationId?: string) {
    this.log({
      event: "weather_provider_request",
      provider,
      stationId,
      requestId,
      startedAt: new Date().toISOString(),
    });
  }

  static logSuccess(
    provider: string,
    stationId: string,
    httpStatus: number,
    responseTimeMs: number,
    observedAt: string,
    ageMinutes: number,
    parseStatus: "valid" | "partial" | "failed",
    qualityStatus: string,
    qualityScore: number,
    requestId?: string
  ) {
    this.log({
      event: "weather_provider_success",
      provider,
      stationId,
      httpStatus,
      responseTimeMs,
      observedAt,
      ageMinutes,
      parseStatus,
      qualityStatus,
      qualityScore,
      requestId,
    });
  }

  static logFailure(
    provider: string,
    errorCode: WeatherErrorCode,
    error: string,
    stationId?: string,
    httpStatus?: number,
    responseTimeMs?: number,
    requestId?: string
  ) {
    this.log({
      event: "weather_provider_failure",
      provider,
      stationId,
      httpStatus,
      responseTimeMs,
      errorCode,
      error: error.replace(/https?:\/\/[^\s]+/g, "[URL]").slice(0, 200),
      requestId,
    });
  }

  static logFusion(
    region: string,
    spotId: string,
    status: "available" | "partial" | "stale" | "unavailable" | "conflicting",
    contributors: string[],
    observationCoverage: number,
    rawWindKt: number,
    adjustedWindKt: number,
    speedCorrectionKt: number,
    confidenceAdjustment: number,
    requestId?: string
  ) {
    this.log({
      event: "weather_fusion_result",
      region,
      spotId,
      status,
      contributors,
      observationCoverage,
      rawWindKt,
      adjustedWindKt,
      speedCorrectionKt,
      confidenceAdjustment,
      requestId,
    });
  }

  static logRecommendation(
    region: string,
    spotId: string,
    weatherInput: WeatherInputType | "observation-adjusted" | "forecast-only",
    windKtUsedForScore: number,
    observationFusionStatus: string,
    requestId?: string,
    extra?: Partial<LogRecommendationEvaluated>
  ) {
    this.log({
      event: "recommendation_evaluated",
      region,
      spotId,
      weatherInput,
      windKtUsedForScore,
      observationFusionStatus,
      requestId,
      ...extra,
    });
  }
}
