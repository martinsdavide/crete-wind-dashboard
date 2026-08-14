import { ObservationLogger } from "../ObservationLogger";
import { ProviderFetchResult } from "./LombardiaClient";

export interface SiarSensorRow {
  station_code: string;
  timestamp: string;
  wind_speed_ms: number;
  wind_gust_ms: number;
  wind_direction_deg: number;
  temperature_c: number;
  precipitation_mm: number;
}

export class SiarClient {
  /**
   * Fetches live sensor rows from the SIR Toscana (SIAR) open-data API.
   *
   * FAIL-CLOSED CONTRACT:
   *   - If SIAR_API_URL is not configured, returns { success: false } immediately.
   *     No network call is attempted. No synthetic data is returned. No timestamp is generated.
   *   - If the request times out or the provider returns a non-2xx status, returns { success: false }.
   *   - Never returns fabricated rows. Any data in the result comes from the live API only.
   */
  static async fetchSensorRows(
    stationIds: string[] = ["TOS01_Grosseto", "TOS02_Talamone"],
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<SiarSensorRow[]>> {
    const apiUrl = process.env.SIAR_API_URL;

    // Fail closed: if the integration is not configured, return immediately without any I/O.
    if (!apiUrl || apiUrl.trim() === "") {
      return {
        success: false,
        httpStatus: 0,
        responseTimeMs: 0,
        error: "SIAR_NOT_CONFIGURED",
        data: null,
      };
    }

    ObservationLogger.logRequest("siar-toscana", requestId);
    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Build the URL with station IDs as query parameters
      const url = new URL(apiUrl);
      for (const id of stationIds) {
        url.searchParams.append("station", id);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "SpotPilot/1.0",
        },
        signal: controller.signal,
      });

      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          httpStatus: response.status,
          responseTimeMs,
          error: `HTTP_${response.status}`,
          data: null,
        };
      }

      const json = await response.json();

      // Expected: the SIAR API returns an array of sensor-row objects.
      // Parse and validate the shape; drop any row that does not have required fields.
      const rows: SiarSensorRow[] = [];
      const rawRows: unknown[] = Array.isArray(json) ? json : json?.data ?? json?.rows ?? [];

      for (const raw of rawRows) {
        const r = raw as Record<string, unknown>;
        if (
          typeof r.station_code === "string" &&
          typeof r.timestamp === "string" &&
          typeof r.wind_speed_ms === "number" &&
          typeof r.wind_gust_ms === "number" &&
          typeof r.wind_direction_deg === "number"
        ) {
          rows.push({
            station_code: r.station_code,
            timestamp: r.timestamp,
            wind_speed_ms: r.wind_speed_ms,
            wind_gust_ms: r.wind_gust_ms,
            wind_direction_deg: r.wind_direction_deg,
            temperature_c: typeof r.temperature_c === "number" ? r.temperature_c : 0,
            precipitation_mm: typeof r.precipitation_mm === "number" ? r.precipitation_mm : 0,
          });
        }
      }

      return {
        success: rows.length > 0,
        httpStatus: response.status,
        responseTimeMs,
        data: rows,
        error: rows.length === 0 ? "EMPTY_RESPONSE" : undefined,
      };
    } catch (err: any) {
      const responseTimeMs = Date.now() - startTime;
      const isTimeout = err?.name === "AbortError";
      return {
        success: false,
        httpStatus: 0,
        responseTimeMs,
        error: isTimeout ? "SIAR_TIMEOUT" : String(err?.message ?? "FETCH_ERROR"),
        data: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

