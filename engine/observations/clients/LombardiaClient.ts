import { ObservationLogger } from "../ObservationLogger";

export interface ProviderFetchResult<T> {
  success: boolean;
  httpStatus: number;
  responseTimeMs: number;
  data: T | null;
  errorCode?: string;
  error?: string;
}

export interface LombardiaSensorMetadata {
  idsensore: string;
  idstazione: string;
  nomestazione?: string;
  nometiposensore?: string;
  unitamisura?: string;
  lat?: string | number;
  lng?: string | number;
  storico?: string;
}

export interface LombardiaReadingRow {
  idsensore: string;
  data: string;
  valore: string | number;
  stato?: string;
}

export class LombardiaClient {
  /**
   * Stage 1: Discovers sensor metadata for given station IDs from Socrata dataset 58is-xzfv.
   */
  static async fetchSensorMetadataForStations(
    stationIds: string[] = ["573", "679"],
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<LombardiaSensorMetadata[]>> {
    const startTime = Date.now();
    if (!stationIds || stationIds.length === 0) {
      return { success: true, httpStatus: 200, responseTimeMs: 0, data: [] };
    }

    const inClause = stationIds.map((id) => `'${id}'`).join(",");
    const url = `https://www.dati.lombardia.it/resource/58is-xzfv.json?$where=idstazione in (${inClause})`;

    ObservationLogger.logRequest("regione-lombardia-meta", requestId);

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
        let errText = `HTTP status ${res.status}`;
        try {
          const body = await res.text();
          if (body) errText += `: ${body.slice(0, 200)}`;
        } catch {}

        const errorCode = res.status === 400 ? "PROVIDER_QUERY_ERROR" : "PROVIDER_HTTP_ERROR";
        ObservationLogger.logFailure(
          "regione-lombardia",
          errorCode,
          errText,
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
          errorCode,
          error: errText,
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

  /**
   * Stage 2: Fetches latest sensor readings by sensor ID list from Socrata dataset 647i-nhxk.
   */
  static async fetchLatestReadingsForSensors(
    sensorIds: string[],
    limit = 200,
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<LombardiaReadingRow[]>> {
    const startTime = Date.now();
    if (!sensorIds || sensorIds.length === 0) {
      return { success: true, httpStatus: 200, responseTimeMs: 0, data: [] };
    }

    const inClause = sensorIds.map((id) => `'${id}'`).join(",");
    const url = `https://www.dati.lombardia.it/resource/647i-nhxk.json?$where=idsensore in (${inClause})&$order=data desc&$limit=${limit}`;

    ObservationLogger.logRequest("regione-lombardia-readings", requestId);

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
        let errText = `HTTP status ${res.status}`;
        try {
          const body = await res.text();
          if (body) errText += `: ${body.slice(0, 200)}`;
        } catch {}

        const errorCode = res.status === 400 ? "PROVIDER_QUERY_ERROR" : "PROVIDER_HTTP_ERROR";
        ObservationLogger.logFailure(
          "regione-lombardia",
          errorCode,
          errText,
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
          errorCode,
          error: errText,
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

  /**
   * Helper executing two-stage discovery and returning joined rows.
   */
  static async fetchSensorRows(
    stationIds: string[] = ["573", "679"],
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<any[]>> {
    const metaRes = await this.fetchSensorMetadataForStations(stationIds, timeoutMs, requestId);
    if (!metaRes.success || !metaRes.data || metaRes.data.length === 0) {
      return {
        success: false,
        httpStatus: metaRes.httpStatus,
        responseTimeMs: metaRes.responseTimeMs,
        data: null,
        errorCode: metaRes.errorCode || "METADATA_FETCH_FAILED",
        error: metaRes.error || "Failed to fetch station sensor metadata",
      };
    }

    const sensorIds = metaRes.data.map((m) => m.idsensore).filter(Boolean);
    const readingsRes = await this.fetchLatestReadingsForSensors(sensorIds, 200, timeoutMs, requestId);

    if (!readingsRes.success || !readingsRes.data) {
      return {
        success: false,
        httpStatus: readingsRes.httpStatus,
        responseTimeMs: metaRes.responseTimeMs + readingsRes.responseTimeMs,
        data: null,
        errorCode: readingsRes.errorCode || "READINGS_FETCH_FAILED",
        error: readingsRes.error || "Failed to fetch sensor readings",
      };
    }

    // Join readings with metadata
    const metaMap = new Map<string, LombardiaSensorMetadata>();
    metaRes.data.forEach((m) => metaMap.set(m.idsensore, m));

    const joinedRows = readingsRes.data.map((r) => {
      const meta = metaMap.get(r.idsensore);
      return {
        ...r,
        idstazione: meta?.idstazione,
        nomestazione: meta?.nomestazione,
        nometiposensore: meta?.nometiposensore,
        unitamisura: meta?.unitamisura,
      };
    });

    return {
      success: true,
      httpStatus: 200,
      responseTimeMs: metaRes.responseTimeMs + readingsRes.responseTimeMs,
      data: joinedRows,
    };
  }
}

