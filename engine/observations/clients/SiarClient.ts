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
  static async fetchSensorRows(
    stationIds: string[] = ["TOS01_Grosseto", "TOS02_Talamone"],
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<SiarSensorRow[]>> {
    const startTime = Date.now();
    ObservationLogger.logRequest("siar-toscana", requestId);

    // Simulate 120ms latency
    await new Promise((resolve) => setTimeout(resolve, 120));
    const responseTimeMs = Date.now() - startTime;

    const mockRows: SiarSensorRow[] = stationIds.map((id) => {
      const isGrosseto = id.includes("Grosseto");
      return {
        station_code: id,
        timestamp: new Date().toISOString(),
        wind_speed_ms: isGrosseto ? 9.5 : 10.5, // ~18.5 or ~20.4 kt
        wind_gust_ms: isGrosseto ? 12.0 : 13.5,
        wind_direction_deg: isGrosseto ? 270 : 315, // W or NW
        temperature_c: 28,
        precipitation_mm: 0,
      };
    });

    return {
      success: true,
      httpStatus: 200,
      responseTimeMs,
      data: mockRows,
    };
  }
}
