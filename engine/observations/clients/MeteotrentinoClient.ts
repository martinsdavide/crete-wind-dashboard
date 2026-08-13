import { ObservationLogger } from "../ObservationLogger";
import { ProviderFetchResult } from "./LombardiaClient";

export class MeteotrentinoClient {
  static async fetchStationXml(
    stationCode: string,
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<string>> {
    const startTime = Date.now();
    const url = `https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione?codice=${stationCode}`;

    ObservationLogger.logRequest("meteotrentino", requestId, stationCode);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/xml, text/xml, */*",
          "User-Agent": "SpotPilot/1.0",
        },
      });
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;

      if (!res.ok) {
        ObservationLogger.logFailure(
          "meteotrentino",
          "PROVIDER_HTTP_ERROR",
          `HTTP status ${res.status}`,
          stationCode,
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

      const text = await res.text();
      return {
        success: true,
        httpStatus: res.status,
        responseTimeMs,
        data: text,
      };
    } catch (e: any) {
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;
      const isTimeout = e?.name === "AbortError";
      const errorCode = isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_HTTP_ERROR";
      const errorMsg = isTimeout ? "Request timed out after 3000ms" : (e?.message || "Fetch failed");

      ObservationLogger.logFailure(
        "meteotrentino",
        errorCode,
        errorMsg,
        stationCode,
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
