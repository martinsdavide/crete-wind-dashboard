import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { normalizeTimestampToUtc, normalizeDirectionDeg } from "../ObservationNormalizer";

export interface MeteotrentinoRawPayload {
  codiceStazione?: string;
  nomeStazione?: string;
  dataOra?: string;
  temperatura?: number | string;
  ventoVelocita?: number | string;
  ventoRaffica?: number | string;
  ventoDirezione?: number | string;
  pressione?: number | string;
  umidita?: number | string;
  precipitazione?: number | string;
  radiazioneSolare?: number | string;
}

export class MeteotrentinoAdapter {
  /**
   * Parses Meteotrentino open station payload into canonical WeatherObservation.
   */
  static parseObservation(
    stationId: string,
    raw: MeteotrentinoRawPayload,
    referenceTime: Date = new Date()
  ): WeatherObservation | null {
    if (!raw) return null;

    const parseNum = (val: any): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const n = typeof val === "number" ? val : parseFloat(val);
      return isNaN(n) ? null : n;
    };

    const observedAt = raw.dataOra
      ? normalizeTimestampToUtc(raw.dataOra)
      : referenceTime.toISOString();

    const rawSpeed = parseNum(raw.ventoVelocita);
    const rawGust = parseNum(raw.ventoRaffica);
    const rawDir = parseNum(raw.ventoDirezione);
    const rawTemp = parseNum(raw.temperatura);
    const rawHumidity = parseNum(raw.umidita);
    const rawPressure = parseNum(raw.pressione);
    const rawPrecip = parseNum(raw.precipitazione);
    const rawSolar = parseNum(raw.radiazioneSolare);

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: rawSpeed !== null ? Math.round(rawSpeed * 10) / 10 : null,
      windGustMs: rawGust !== null ? Math.round(rawGust * 10) / 10 : null,
      windDirectionDeg: normalizeDirectionDeg(rawDir),
      temperatureC: rawTemp !== null ? Math.round(rawTemp * 10) / 10 : null,
      relativeHumidityPct: rawHumidity !== null ? Math.round(rawHumidity) : null,
      pressureHpa: rawPressure !== null ? Math.round(rawPressure * 10) / 10 : null,
      precipitationMm: rawPrecip !== null ? Math.round(rawPrecip * 10) / 10 : null,
      solarRadiationWm2: rawSolar !== null ? Math.round(rawSolar) : null,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}
