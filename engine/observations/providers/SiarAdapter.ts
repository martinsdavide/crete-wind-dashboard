import { WeatherObservation } from "../types";
import { SiarClient, SiarSensorRow } from "../clients/SiarClient";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { ObservationLogger } from "../ObservationLogger";

export class SiarAdapter {
  /**
   * Fetches latest sensor data from SIR Toscana (SIAR) client and parses it.
   */
  static async fetchLatestObservations(
    stationMapping: Record<string, string> = {
      TOS01_Grosseto: "siar:marina_grosseto",
      TOS02_Talamone: "siar:talamone_sentinel",
    },
    referenceTime: Date = new Date(),
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};
    const providerStationIds = Object.keys(stationMapping);
    if (providerStationIds.length === 0) return results;

    const fetchRes = await SiarClient.fetchSensorRows(providerStationIds, timeoutMs, requestId);
    if (!fetchRes.success || !fetchRes.data || fetchRes.data.length === 0) {
      return results;
    }

    for (const row of fetchRes.data) {
      const canonicalId = stationMapping[row.station_code];
      if (canonicalId) {
        const obs = this.parseObservation(canonicalId, row, referenceTime);
        if (obs) {
          results[canonicalId] = obs;

          ObservationLogger.logSuccess(
            "siar-toscana",
            canonicalId,
            fetchRes.httpStatus,
            fetchRes.responseTimeMs,
            obs.observedAt,
            obs.quality.reasons.includes("OK") ? 5 : 45, // approx age
            "valid",
            obs.quality.status,
            obs.quality.score,
            requestId
          );
        }
      }
    }

    return results;
  }

  private static parseObservation(
    stationId: string,
    row: SiarSensorRow,
    referenceTime: Date
  ): WeatherObservation | null {
    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt: row.timestamp,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: row.wind_speed_ms,
      windGustMs: row.wind_gust_ms,
      windDirectionDeg: row.wind_direction_deg,
      temperatureC: row.temperature_c,
      relativeHumidityPct: null,
      pressureHpa: null,
      precipitationMm: row.precipitation_mm,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}
