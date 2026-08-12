import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { normalizeTimestampToUtc, normalizeDirectionDeg } from "../ObservationNormalizer";

export interface MeteoSwissRecord {
  station_code?: string;
  timestamp?: string;
  tre200s0?: number; // temperature 2m (°C)
  fu3010z0?: number; // wind speed (km/h)
  fu3010z1?: number; // wind gust (km/h)
  dkl010z0?: number; // wind direction (deg)
  prestas0?: number; // pressure at station (hPa)
  rre150z0?: number; // precipitation (mm)
}

export class MeteoSwissAdapter {
  static parseObservation(
    stationId: string,
    record: MeteoSwissRecord,
    referenceTime: Date = new Date()
  ): WeatherObservation | null {
    if (!record) return null;

    const observedAt = record.timestamp
      ? normalizeTimestampToUtc(record.timestamp)
      : referenceTime.toISOString();

    const speedKmH = record.fu3010z0;
    const gustKmH = record.fu3010z1;
    const speedMs = speedKmH !== undefined && speedKmH !== null ? speedKmH * 0.277778 : null;
    const gustMs = gustKmH !== undefined && gustKmH !== null ? gustKmH * 0.277778 : null;

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: speedMs !== null ? Math.round(speedMs * 10) / 10 : null,
      windGustMs: gustMs !== null ? Math.round(gustMs * 10) / 10 : null,
      windDirectionDeg: normalizeDirectionDeg(record.dkl010z0),
      temperatureC: record.tre200s0 !== undefined && record.tre200s0 !== null ? record.tre200s0 : null,
      pressureHpa: record.prestas0 !== undefined && record.prestas0 !== null ? record.prestas0 : null,
      precipitationMm: record.rre150z0 !== undefined && record.rre150z0 !== null ? record.rre150z0 : null,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}
