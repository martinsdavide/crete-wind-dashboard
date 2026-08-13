import { ObservationLogger } from "../ObservationLogger";
import { ProviderFetchResult } from "./LombardiaClient";

export class MeteoSwissClient {
  static async fetchLatestGeoJson(
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<any>> {
    const startTime = Date.now();
    const url = "https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/ch.meteoschweiz.messwerte-aktuell_it.json";

    ObservationLogger.logRequest("meteoswiss", requestId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "SpotPilot/1.0",
        },
      });
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;

      if (!res.ok) {
        ObservationLogger.logFailure(
          "meteoswiss",
          "PROVIDER_HTTP_ERROR",
          `HTTP status ${res.status}`,
          undefined,
          res.status,
          responseTimeMs,
          requestId
        );
        return {
          success: false,
          httpStatus: res.status,
          responseTimeMs,
          data: null,
          errorCode: "PROVIDER_HTTP_ERROR",
          error: `HTTP ${res.status}`,
        };
      }

      const json = await res.json();
      return {
        success: true,
        httpStatus: res.status,
        responseTimeMs,
        data: json,
      };
    } catch (e: any) {
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;
      const isTimeout = e?.name === "AbortError";
      const errorCode = isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_HTTP_ERROR";
      const errorMsg = isTimeout ? "Request timed out after 3000ms" : (e?.message || "Fetch failed");

      ObservationLogger.logFailure(
        "meteoswiss",
        errorCode,
        errorMsg,
        undefined,
        0,
        responseTimeMs,
        requestId
      );

      return {
        success: false,
        httpStatus: 0,
        responseTimeMs,
        data: null,
        errorCode,
        error: errorMsg,
      };
    }
  }
}
