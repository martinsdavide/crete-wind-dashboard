import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { normalizeDirectionDeg, kmhToMs } from "../ObservationNormalizer";
import { MeteoSwissClient } from "../clients/MeteoSwissClient";
import { ObservationLogger } from "../ObservationLogger";

export interface MeteoSwissRecord {
  station_code?: string;
  timestamp?: string; // UTC ISO string
  tre200s0?: number | null; // temperature 2m (°C)
  fu3010z0?: number | null; // wind speed (km/h)
  fu3010z1?: number | null; // wind gust (km/h)
  dkl010z0?: number | null; // wind direction (deg)
  prestas0?: number | null; // pressure at station (hPa)
  rre150z0?: number | null; // precipitation (mm)
}

export class MeteoSwissAdapter {
  /**
   * Expected station metadata for identity verification.
   */
  static readonly EXPECTED_STATIONS: Record<string, { expectedName: string; lat: number; lng: number }> = {
    SBO: { expectedName: "san bernardino", lat: 46.463, lng: 9.185 },
  };

  /**
   * Helper to parse provider YYYYMMDDhhmm UTC timestamp into ISO string.
   */
  static parseSmnTimestampToUtc(rawDateStr: string): string {
    if (!rawDateStr) return new Date().toISOString();
    const str = rawDateStr.trim();
    if (/^\d{12}$/.test(str)) {
      const year = parseInt(str.slice(0, 4), 10);
      const month = parseInt(str.slice(4, 6), 10) - 1;
      const day = parseInt(str.slice(6, 8), 10);
      const hour = parseInt(str.slice(8, 10), 10);
      const min = parseInt(str.slice(10, 12), 10);
      return new Date(Date.UTC(year, month, day, hour, min)).toISOString();
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  /**
   * Parses MeteoSwiss SMN semicolon CSV text into a map of station_code -> MeteoSwissRecord.
   */
  static parseCsvPayload(csvText: string): Record<string, MeteoSwissRecord> {
    const records: Record<string, MeteoSwissRecord> = {};
    if (!csvText || csvText.trim().length === 0) return records;

    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return records;

    // Line 0 contains column names: Station/Location;Date;tre200s0;rre150z0;...;fu3010z0;fu3010z1;...
    const headers = lines[0].split(";").map((h) => h.trim());
    const stationIdx = headers.findIndex((h) => /^station/i.test(h) || h === "Station/Location");
    const dateIdx = headers.findIndex((h) => /^date/i.test(h) || h === "Date");

    const getIdx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const tempIdx = getIdx("tre200s0");
    const precipIdx = getIdx("rre150z0");
    const dirIdx = getIdx("dkl010z0");
    const speedIdx = getIdx("fu3010z0");
    const gustIdx = getIdx("fu3010z1");
    const pressIdx = getIdx("prestas0");

    const parseNum = (val: string | undefined): number | null => {
      if (!val || val === "-" || val === "n/a") return null;
      const n = parseFloat(val.replace(",", "."));
      return isNaN(n) ? null : n;
    };

    // Skip header lines (lines 0 and line 1 unit definitions if present)
    const startRow = lines[1].toLowerCase().includes("yyyymmddhhmm") || lines[1].includes("°C") ? 2 : 1;

    for (let i = startRow; i < lines.length; i++) {
      const parts = lines[i].split(";").map((p) => p.trim());
      if (parts.length <= Math.max(stationIdx, dateIdx)) continue;

      const code = parts[stationIdx];
      if (!code) continue;

      const rawDate = dateIdx >= 0 ? parts[dateIdx] : "";
      const timestamp = this.parseSmnTimestampToUtc(rawDate);

      records[code] = {
        station_code: code,
        timestamp,
        tre200s0: tempIdx >= 0 ? parseNum(parts[tempIdx]) : null,
        rre150z0: precipIdx >= 0 ? parseNum(parts[precipIdx]) : null,
        dkl010z0: dirIdx >= 0 ? parseNum(parts[dirIdx]) : null,
        fu3010z0: speedIdx >= 0 ? parseNum(parts[speedIdx]) : null,
        fu3010z1: gustIdx >= 0 ? parseNum(parts[gustIdx]) : null,
        prestas0: pressIdx >= 0 ? parseNum(parts[pressIdx]) : null,
      };
    }

    return records;
  }

  /**
   * Fetches latest values from MeteoSwiss Open Data repository via STAC CSV asset discovery.
   */
  static async fetchLatestObservations(
    stationMapping: Record<string, string> = { SBO: "meteoswiss:san_bernardino" },
    referenceTime: Date = new Date(),
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};
    const startTime = Date.now();

    const fetchRes = await MeteoSwissClient.fetchCurrentAllStationsCsv(undefined, undefined, timeoutMs, requestId);
    const responseTimeMs = Date.now() - startTime;

    if (!fetchRes.success || !fetchRes.data?.csvText) {
      ObservationLogger.logFailure(
        "meteoswiss",
        (fetchRes.errorCode as any) || "PROVIDER_HTTP_ERROR",
        fetchRes.error || "MeteoSwiss CSV fetch failed",
        undefined,
        fetchRes.httpStatus,
        responseTimeMs,
        requestId
      );
      return results;
    }

    const csvRecords = this.parseCsvPayload(fetchRes.data.csvText);

    for (const [code, canonicalId] of Object.entries(stationMapping)) {
      const record = csvRecords[code];

      if (!record) {
        ObservationLogger.logFailure(
          "meteoswiss",
          "STATION_NOT_FOUND",
          `Station ${code} not found in STAC SMN CSV product`,
          code,
          200,
          responseTimeMs,
          requestId
        );
        continue;
      }

      const obs = this.parseObservation(canonicalId, record, referenceTime, responseTimeMs);
      if (obs) {
        results[canonicalId] = obs;
      }
    }

    return results;
  }

  /**
   * Normalizes raw MeteoSwissRecord into canonical WeatherObservation object.
   */
  static parseObservation(
    stationId: string,
    record: MeteoSwissRecord,
    referenceTime: Date = new Date(),
    responseTimeMs = 0
  ): WeatherObservation | null {
    if (!record) return null;

    const stationCode = stationId.replace("meteoswiss:", "");
    const observedAt = record.timestamp || referenceTime.toISOString();

    const speedKmH = record.fu3010z0;
    const gustKmH = record.fu3010z1;
    const speedMs = speedKmH !== undefined && speedKmH !== null ? kmhToMs(speedKmH) : null;
    const gustMs = gustKmH !== undefined && gustKmH !== null ? kmhToMs(gustKmH) : null;

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: speedMs,
      windGustMs: gustMs,
      windDirectionDeg: normalizeDirectionDeg(record.dkl010z0),
      temperatureC: record.tre200s0 !== undefined && record.tre200s0 !== null ? record.tre200s0 : null,
      pressureHpa: record.prestas0 !== undefined && record.prestas0 !== null ? record.prestas0 : null,
      precipitationMm: record.rre150z0 !== undefined && record.rre150z0 !== null ? record.rre150z0 : null,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);
    const ageMinutes = Math.round((referenceTime.getTime() - new Date(observedAt).getTime()) / (60 * 1000));

    ObservationLogger.logEvent({
      event: "weather_provider_result",
      provider: "meteoswiss",
      stationId: stationCode,
      status: (partialObs.windSpeedMs !== null || partialObs.windDirectionDeg !== null) ? "success" : "partial",
      httpStatus: 200,
      recordsReceived: 1,
      selectedObservedAt: observedAt,
      ageMinutes,
      hasWindSpeed: partialObs.windSpeedMs !== null,
      hasWindGust: partialObs.windGustMs !== null,
      hasDirection: partialObs.windDirectionDeg !== null,
      responseTimeMs,
    });

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}

