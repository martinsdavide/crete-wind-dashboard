import { WeatherObservation } from "../types";
import { SiarClient, SiarSensorRow } from "../clients/SiarClient";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { parseLocalTimeToUtc } from "../ObservationNormalizer";
import { ObservationLogger } from "../ObservationLogger";

export class SiarAdapter {
  static readonly SUPPORTED_SCHEMA_VERSION = "1";

  /**
   * Expected station mapping for identity verification.
   */
  static readonly EXPECTED_STATIONS: Record<string, string> = {
    TOS11000103: "siar:marina_grosseto",
    TOS11000103_Alberese: "siar:marina_grosseto",
    TOS01_Grosseto: "siar:marina_grosseto",
    TOS01: "siar:marina_grosseto",
    TOS02_Talamone: "siar:talamone_sentinel",
    TOS02: "siar:talamone_sentinel",
  };

  /**
   * Fetches latest sensor data from SIR Toscana (SIAR) client and parses it.
   */
  static async fetchLatestObservations(
    stationMapping: Record<string, string> = {
      TOS11000103: "siar:marina_grosseto",
      TOS02_Talamone: "siar:talamone_sentinel",
    },
    referenceTime: Date = new Date(),
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};
    const providerStationIds = Object.keys(stationMapping);
    if (providerStationIds.length === 0) return results;

    const startTime = Date.now();
    const fetchRes = await SiarClient.fetchSensorRows(providerStationIds, timeoutMs, requestId);
    const responseTimeMs = Date.now() - startTime;

    if (!fetchRes.success || !fetchRes.data || fetchRes.data.length === 0) {
      if (fetchRes.errorCode && fetchRes.errorCode !== "PROVIDER_NOT_CONFIGURED") {
        ObservationLogger.logFailure(
          "siar-toscana",
          (fetchRes.errorCode as any) || "PROVIDER_HTTP_ERROR",
          fetchRes.error || "Fetch failed",
          undefined,
          fetchRes.httpStatus,
          responseTimeMs,
          requestId
        );
      }
      return results;
    }

    for (const row of fetchRes.data) {
      // Resolve canonical ID (supports both TOS01_Grosseto and TOS01)
      const canonicalId = stationMapping[row.station_code] || this.EXPECTED_STATIONS[row.station_code];
      if (!canonicalId) {
        ObservationLogger.logFailure(
          "siar-toscana",
          "STATION_NOT_FOUND",
          `Station code ${row.station_code} is not recognized`,
          row.station_code,
          200,
          responseTimeMs,
          requestId
        );
        continue;
      }

      // Check declared schema version
      if (row.schemaVersion && String(row.schemaVersion) !== this.SUPPORTED_SCHEMA_VERSION) {
        ObservationLogger.logFailure(
          "siar-toscana",
          "PROVIDER_SCHEMA_CHANGED",
          `Schema version ${row.schemaVersion} unsupported (expected ${this.SUPPORTED_SCHEMA_VERSION})`,
          row.station_code,
          200,
          responseTimeMs,
          requestId
        );
        continue;
      }

      const obs = this.parseObservation(canonicalId, row, referenceTime, responseTimeMs);
      if (obs) {
        results[canonicalId] = obs;
      }
    }

    return results;
  }

  static parseObservation(
    stationId: string,
    row: SiarSensorRow,
    referenceTime: Date = new Date(),
    responseTimeMs = 0
  ): WeatherObservation | null {
    if (!row) return null;

    const stationCode = stationId.replace("siar:", "");
    const observedAt = parseLocalTimeToUtc(row.timestamp, "Europe/Rome");

    // Validate boundaries
    const windSpeedMs = typeof row.wind_speed_ms === "number" && row.wind_speed_ms >= 0 ? row.wind_speed_ms : null;
    const windGustMs = typeof row.wind_gust_ms === "number" && row.wind_gust_ms >= 0 ? row.wind_gust_ms : null;
    const windDirectionDeg =
      typeof row.wind_direction_deg === "number" && row.wind_direction_deg >= 0 && row.wind_direction_deg <= 360
        ? row.wind_direction_deg
        : null;

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs,
      windGustMs,
      windDirectionDeg,
      temperatureC: typeof row.temperature_c === "number" ? row.temperature_c : null,
      relativeHumidityPct: null,
      pressureHpa: null,
      precipitationMm: typeof row.precipitation_mm === "number" && row.precipitation_mm >= 0 ? row.precipitation_mm : null,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);
    const ageMinutes = Math.round((referenceTime.getTime() - new Date(observedAt).getTime()) / (60 * 1000));

    ObservationLogger.logEvent({
      event: "weather_provider_result",
      provider: "siar-toscana",
      stationId: stationCode,
      status: (windSpeedMs !== null || windDirectionDeg !== null) ? "success" : "partial",
      httpStatus: 200,
      recordsReceived: 1,
      selectedObservedAt: observedAt,
      ageMinutes,
      hasWindSpeed: windSpeedMs !== null,
      hasWindGust: windGustMs !== null,
      hasDirection: windDirectionDeg !== null,
      responseTimeMs,
    });

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}

