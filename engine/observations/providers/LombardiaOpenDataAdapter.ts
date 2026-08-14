import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { parseLocalTimeToUtc, normalizeDirectionDeg, kmhToMs } from "../ObservationNormalizer";
import { LombardiaClient, LombardiaSensorMetadata } from "../clients/LombardiaClient";
import { ObservationLogger } from "../ObservationLogger";

export interface LombardiaSensorRow {
  idsensore?: string;
  idstazione?: string;
  nomestazione?: string;
  data?: string;
  valore?: string | number;
  nometiposensore?: string;
  unitamisura?: string;
}

export class LombardiaOpenDataAdapter {
  /**
   * Expected station identity rules to prevent accidental ID reassignment.
   */
  static readonly EXPECTED_STATIONS: Record<string, { expectedName: string; lat: number; lng: number }> = {
    "573": { expectedName: "colico", lat: 46.141, lng: 9.370 },
    "679": { expectedName: "valmadrera", lat: 45.849, lng: 9.408 },
  };

  /**
   * Validates metadata station identity against expected physical station name and coordinates.
   */
  static validateStationIdentity(stationId: string, metadataRows: LombardiaSensorMetadata[]): boolean {
    const expected = this.EXPECTED_STATIONS[stationId];
    if (!expected) return true; // If unconfigured custom station ID, skip strict identity check

    const stationMeta = metadataRows.find((m) => String(m.idstazione) === String(stationId));
    if (!stationMeta) return false;

    const nameMatch = stationMeta.nomestazione
      ? stationMeta.nomestazione.toLowerCase().includes(expected.expectedName)
      : false;

    let coordMatch = true;
    if (stationMeta.lat && stationMeta.lng) {
      const latNum = typeof stationMeta.lat === "number" ? stationMeta.lat : parseFloat(stationMeta.lat);
      const lngNum = typeof stationMeta.lng === "number" ? stationMeta.lng : parseFloat(stationMeta.lng);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        coordMatch = Math.abs(latNum - expected.lat) < 0.2 && Math.abs(lngNum - expected.lng) < 0.2;
      }
    }

    return nameMatch && coordMatch;
  }

  /**
   * Normalize sensor description string (lowercased, accents removed).
   */
  private static normalizeSensorType(typeStr: string | null | undefined): string | null {
    if (!typeStr) return null;
    const norm = typeStr
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (norm.includes("velocita vento") || norm.includes("wind speed")) return "wind_speed";
    if (norm.includes("raffica") || norm.includes("wind gust")) return "wind_gust";
    if (norm.includes("direzione vento") || norm.includes("wind direction")) return "wind_direction";
    if (norm.includes("temperatura") || norm.includes("temperature")) return "temperature";
    if (norm.includes("precipitazione") || norm.includes("precipitation")) return "precipitation";
    if (norm.includes("umidita") || norm.includes("humidity")) return "humidity";
    return null;
  }

  /**
   * Fetches latest sensor data from Regione Lombardia Socrata Open Data endpoints.
   */
  static async fetchLatestObservations(
    stationMapping: Record<string, string> = {
      "573": "lombardia:colico",
      "679": "lombardia:valmadrera",
    },
    referenceTime: Date = new Date(),
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};
    const stationIdsList = Object.keys(stationMapping);
    if (stationIdsList.length === 0) return results;

    const startTime = Date.now();

    // Stage 1: Fetch metadata
    const metaRes = await LombardiaClient.fetchSensorMetadataForStations(stationIdsList, timeoutMs, requestId);
    if (!metaRes.success || !metaRes.data || metaRes.data.length === 0) {
      ObservationLogger.logFailure(
        "regione-lombardia",
        (metaRes.errorCode as any) || "PROVIDER_QUERY_ERROR",
        metaRes.error || "Metadata fetch failed",
        undefined,
        metaRes.httpStatus,
        metaRes.responseTimeMs,
        requestId
      );
      return results;
    }

    const metadataRows = metaRes.data;

    // Validate station identity for each requested station
    const validStationIds: string[] = [];
    for (const stId of stationIdsList) {
      if (this.validateStationIdentity(stId, metadataRows)) {
        validStationIds.push(stId);
      } else {
        ObservationLogger.logFailure(
          "regione-lombardia",
          "PROVIDER_SCHEMA_CHANGED",
          `Station identity mismatch for station ID ${stId}`,
          stId,
          200,
          0,
          requestId
        );
      }
    }

    if (validStationIds.length === 0) return results;

    // Filter sensor IDs belonging to validated stations
    const activeSensorIds = metadataRows
      .filter((m) => validStationIds.includes(String(m.idstazione)))
      .map((m) => m.idsensore)
      .filter(Boolean);

    // Stage 2: Fetch readings
    const readingsRes = await LombardiaClient.fetchLatestReadingsForSensors(activeSensorIds, 200, timeoutMs, requestId);
    const responseTimeMs = Date.now() - startTime;

    if (!readingsRes.success || !readingsRes.data || readingsRes.data.length === 0) {
      return results;
    }

    // Join readings with metadata
    const metaMap = new Map<string, LombardiaSensorMetadata>();
    metadataRows.forEach((m) => metaMap.set(String(m.idsensore), m));

    const joinedRows: LombardiaSensorRow[] = readingsRes.data.map((r) => {
      const meta = metaMap.get(String(r.idsensore));
      return {
        ...r,
        idstazione: meta ? String(meta.idstazione) : undefined,
        nomestazione: meta?.nomestazione,
        nometiposensore: meta?.nometiposensore,
        unitamisura: meta?.unitamisura,
      };
    });

    // Group rows by station ID
    const rowsByStation: Record<string, LombardiaSensorRow[]> = {};
    for (const row of joinedRows) {
      if (!row.idstazione) continue;
      if (!rowsByStation[row.idstazione]) {
        rowsByStation[row.idstazione] = [];
      }
      rowsByStation[row.idstazione].push(row);
    }

    for (const [stId, rowsList] of Object.entries(rowsByStation)) {
      const canonicalId = stationMapping[stId];
      if (canonicalId) {
        const parsed = this.parseObservations(canonicalId, rowsList, referenceTime, responseTimeMs);
        if (parsed) {
          results[canonicalId] = parsed;
        }
      }
    }

    return results;
  }

  /**
   * Normalizes raw joined rows from Lombardia Open Data Socrata API into canonical WeatherObservation objects.
   */
  static parseObservations(
    stationId: string,
    rows: LombardiaSensorRow[],
    referenceTime: Date = new Date(),
    responseTimeMs = 0
  ): WeatherObservation | null {
    if (!rows || rows.length === 0) return null;

    const stationCode = stationId.replace("lombardia:", "");

    interface ReadingCandidate {
      value: number;
      timestamp: string; // UTC ISO
      rawUnit: string | null;
    }

    const parameterCandidates: Record<string, ReadingCandidate[]> = {
      wind_speed: [],
      wind_gust: [],
      wind_direction: [],
      temperature: [],
      precipitation: [],
      humidity: [],
    };

    for (const row of rows) {
      if (!row.data) continue;
      const val = typeof row.valore === "number" ? row.valore : row.valore ? parseFloat(row.valore) : NaN;
      if (isNaN(val)) continue;

      const pType = this.normalizeSensorType(row.nometiposensore);
      if (!pType) continue;

      const utcTs = parseLocalTimeToUtc(row.data, "Europe/Rome");
      parameterCandidates[pType].push({
        value: val,
        timestamp: utcTs,
        rawUnit: row.unitamisura || null,
      });
    }

    // Sort each candidate list by timestamp descending (newest first)
    for (const key of Object.keys(parameterCandidates)) {
      parameterCandidates[key].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const latestSpeed = parameterCandidates.wind_speed.length > 0 ? parameterCandidates.wind_speed[0] : null;
    const latestGust = parameterCandidates.wind_gust.length > 0 ? parameterCandidates.wind_gust[0] : null;
    const latestDir = parameterCandidates.wind_direction.length > 0 ? parameterCandidates.wind_direction[0] : null;
    const latestTemp = parameterCandidates.temperature.length > 0 ? parameterCandidates.temperature[0] : null;
    const latestPrecip = parameterCandidates.precipitation.length > 0 ? parameterCandidates.precipitation[0] : null;
    const latestHumid = parameterCandidates.humidity.length > 0 ? parameterCandidates.humidity[0] : null;

    // Cross-parameter timestamp consistency check for wind readings:
    // Reject wind combination if speed vs direction or speed vs gust timestamps differ by > 30 mins (1800000 ms)
    let validSpeed = latestSpeed;
    let validGust = latestGust;
    let validDir = latestDir;

    if (validSpeed && validDir) {
      const speedTimeMs = new Date(validSpeed.timestamp).getTime();
      const dirTimeMs = new Date(validDir.timestamp).getTime();
      if (Math.abs(speedTimeMs - dirTimeMs) > 30 * 60 * 1000) {
        // Discard direction if too far apart in time
        validDir = null;
      }
    }

    if (validSpeed && validGust) {
      const speedTimeMs = new Date(validSpeed.timestamp).getTime();
      const gustTimeMs = new Date(validGust.timestamp).getTime();
      if (Math.abs(speedTimeMs - gustTimeMs) > 30 * 60 * 1000) {
        validGust = null;
      }
    }

    // Determine canonical observedAt timestamp from the newest valid wind reading
    let observedAt: string | null = null;
    if (validSpeed) observedAt = validSpeed.timestamp;
    else if (validDir) observedAt = validDir.timestamp;
    else if (latestTemp) observedAt = latestTemp.timestamp;
    else if (rows[0].data) observedAt = parseLocalTimeToUtc(rows[0].data, "Europe/Rome");
    else observedAt = referenceTime.toISOString();

    // Unit conversion helper
    const convertSpeed = (cand: ReadingCandidate | null): number | null => {
      if (!cand) return null;
      const unit = (cand.rawUnit || "m/s").toLowerCase().trim();
      let msVal = cand.value;
      if (unit === "km/h" || unit === "kmh") {
        msVal = kmhToMs(cand.value) ?? cand.value;
      }
      return Math.round(msVal * 10) / 10;
    };

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: convertSpeed(validSpeed),
      windGustMs: convertSpeed(validGust),
      windDirectionDeg: validDir ? normalizeDirectionDeg(validDir.value) : null,
      temperatureC: latestTemp ? Math.round(latestTemp.value * 10) / 10 : null,
      relativeHumidityPct: latestHumid ? Math.round(latestHumid.value) : null,
      pressureHpa: null,
      precipitationMm: latestPrecip ? Math.round(latestPrecip.value * 10) / 10 : null,
      solarRadiationWm2: null,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);
    const ageMinutes = Math.round((referenceTime.getTime() - new Date(observedAt).getTime()) / (60 * 1000));

    ObservationLogger.logEvent({
      event: "weather_provider_result",
      provider: "regione-lombardia",
      stationId: stationCode,
      status: (validSpeed || validDir) ? "success" : "partial",
      httpStatus: 200,
      recordsReceived: rows.length,
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

