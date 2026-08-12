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
  /**
   * Fetches latest values from MeteoSwiss Open Data repository.
   */
  static async fetchLatestObservations(
    stationMapping: Record<string, string> = { SBO: "meteoswiss:san_bernardino" },
    referenceTime: Date = new Date(),
    timeoutMs = 3000
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};
    const url = "https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/ch.meteoschweiz.messwerte-aktuell_it.json";

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

      if (!res.ok) return results;

      const data = await res.json();
      const features: any[] = data?.features || [];

      for (const feat of features) {
        const stationCode = feat?.id || feat?.properties?.station_code;
        const canonicalId = stationMapping[stationCode];
        if (canonicalId) {
          const props = feat.properties || {};
          const record: MeteoSwissRecord = {
            station_code: stationCode,
            timestamp: props.reference_ts,
            tre200s0: props.tre200s0,
            fu3010z0: props.fu3010z0,
            fu3010z1: props.fu3010z1,
            dkl010z0: props.dkl010z0,
            prestas0: props.prestas0,
            rre150z0: props.rre150z0,
          };
          const obs = this.parseObservation(canonicalId, record, referenceTime);
          if (obs) {
            results[canonicalId] = obs;
          }
        }
      }

      return results;
    } catch {
      clearTimeout(timer);
      return results;
    }
  }

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
