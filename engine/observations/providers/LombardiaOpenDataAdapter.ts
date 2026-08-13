import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { normalizeTimestampToUtc, normalizeDirectionDeg } from "../ObservationNormalizer";

import { LombardiaClient } from "../clients/LombardiaClient";
import { ObservationLogger } from "../ObservationLogger";

export interface LombardiaSensorRow {
  idsensore?: string;
  idstazione?: string;
  data?: string;
  valore?: string | number;
  nometiposensore?: string;
  unitamisura?: string;
}

export class LombardiaOpenDataAdapter {
  static readonly SENSOR_TYPES: Record<string, string> = {
    "Velocità Vento": "wind_speed",
    "Velocita Vento": "wind_speed",
    "Raffica Vento": "wind_gust",
    "Raffica": "wind_gust",
    "Direzione Vento": "wind_direction",
    "Temperatura": "temperature",
    "Precipitazione": "precipitation",
    "Umidità Relativa": "humidity",
    "Umidita Relativa": "humidity",
  };

  /**
   * Fetches latest sensor data from Regione Lombardia Socrata Open Data endpoint.
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

    const fetchRes = await LombardiaClient.fetchSensorRows(stationIdsList, timeoutMs, requestId);
    if (!fetchRes.success || !fetchRes.data || fetchRes.data.length === 0) {
      return results;
    }

    const rows: LombardiaSensorRow[] = fetchRes.data;

    // Group rows by station ID
    const rowsByStation: Record<string, LombardiaSensorRow[]> = {};
    for (const row of rows) {
      if (!row.idstazione) continue;
      if (!rowsByStation[row.idstazione]) {
        rowsByStation[row.idstazione] = [];
      }
      rowsByStation[row.idstazione].push(row);
    }

    for (const [stId, rowsList] of Object.entries(rowsByStation)) {
      const canonicalId = stationMapping[stId];
      if (canonicalId) {
        const parsed = this.parseObservations(canonicalId, rowsList, referenceTime);
        if (parsed) {
          results[canonicalId] = parsed;
        }
      }
    }

    return results;
  }

  /**
   * Normalizes raw rows from Lombardia Open Data Socrata API into canonical WeatherObservation objects.
   */
  static parseObservations(
    stationId: string,
    rows: LombardiaSensorRow[],
    referenceTime: Date = new Date()
  ): WeatherObservation | null {
    if (!rows || rows.length === 0) return null;

    let observedAt: string | null = null;
    let windSpeedMs: number | null = null;
    let windGustMs: number | null = null;
    let windDirectionDeg: number | null = null;
    let temperatureC: number | null = null;
    let relativeHumidityPct: number | null = null;
    let pressureHpa: number | null = null;
    let precipitationMm: number | null = null;
    let solarRadiationWm2: number | null = null;

    for (const row of rows) {
      if (row.data && !observedAt) {
        observedAt = normalizeTimestampToUtc(row.data);
      }

      const val = typeof row.valore === "number" ? row.valore : row.valore ? parseFloat(row.valore) : NaN;
      if (isNaN(val)) continue;

      const sensorType = row.nometiposensore;
      const unit = row.unitamisura?.toLowerCase();

      if (sensorType === "Velocità Vento" || sensorType === "Velocita Vento") {
        if (windSpeedMs === null) {
          windSpeedMs = unit === "km/h" ? val * 0.277778 : val;
        }
      } else if (sensorType === "Raffica Vento" || sensorType === "Raffica") {
        if (windGustMs === null) {
          windGustMs = unit === "km/h" ? val * 0.277778 : val;
        }
      } else if (sensorType === "Direzione Vento") {
        if (windDirectionDeg === null) {
          windDirectionDeg = normalizeDirectionDeg(val);
        }
      } else if (sensorType === "Temperatura") {
        if (temperatureC === null) {
          temperatureC = val;
        }
      } else if (sensorType === "Precipitazione") {
        if (precipitationMm === null) {
          precipitationMm = val;
        }
      } else if (sensorType === "Umidità Relativa" || sensorType === "Umidita Relativa") {
        if (relativeHumidityPct === null) {
          relativeHumidityPct = val;
        }
      }
    }

    if (!observedAt) {
      observedAt = referenceTime.toISOString();
    }

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: windSpeedMs !== null ? Math.round(windSpeedMs * 10) / 10 : null,
      windGustMs: windGustMs !== null ? Math.round(windGustMs * 10) / 10 : null,
      windDirectionDeg,
      temperatureC: temperatureC !== null ? Math.round(temperatureC * 10) / 10 : null,
      relativeHumidityPct: relativeHumidityPct !== null ? Math.round(relativeHumidityPct) : null,
      pressureHpa,
      precipitationMm: precipitationMm !== null ? Math.round(precipitationMm * 10) / 10 : null,
      solarRadiationWm2,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}
