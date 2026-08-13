import { ObservationLogger } from "../ObservationLogger";

export interface ProviderFetchResult<T> {
  success: boolean;
  httpStatus: number;
  responseTimeMs: number;
  data: T | null;
  errorCode?: string;
  error?: string;
}

export class LombardiaClient {
  static async fetchSensorRows(
    stationIds: string[] = ["573", "679"],
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<any[]>> {
    const startTime = Date.now();
    const inClause = stationIds.map((id) => `'${id}'`).join(",");
    const url = `https://www.dati.lombardia.it/resource/647i-nhxk.json?$where=idstazione in (${inClause})&$order=Data desc&$limit=100`;

    ObservationLogger.logRequest("regione-lombardia", requestId);

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
          "regione-lombardia",
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
        data: Array.isArray(json) ? json : [],
      };
    } catch (e: any) {
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;
      const isTimeout = e?.name === "AbortError";
      const errorCode = isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_HTTP_ERROR";
      const errorMsg = isTimeout ? "Request timed out after 3000ms" : (e?.message || "Fetch failed");

      ObservationLogger.logFailure(
        "regione-lombardia",
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
