import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { normalizeTimestampToUtc, normalizeDirectionDeg } from "../ObservationNormalizer";

export class MeteotrentinoAdapter {
  /**
   * Fetches latest observations from Meteotrentino open data endpoints.
   */
  static async fetchLatestObservations(
    stationCodes: string[] = ["T0193", "T0401", "T0354"],
    referenceTime: Date = new Date(),
    timeoutMs = 3000
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};

    const fetchPromises = stationCodes.map(async (code) => {
      const canonicalId = `meteotrentino:${code}`;
      const url = `https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione?codice=${code}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/xml, text/xml, */*",
            "User-Agent": "SpotPilot/1.0",
          },
        });
        clearTimeout(timer);

        if (!res.ok) return;

        const xmlText = await res.text();
        const obs = this.parseXmlPayload(canonicalId, xmlText, referenceTime);
        if (obs) {
          results[canonicalId] = obs;
        }
      } catch {
        clearTimeout(timer);
      }
    });

    await Promise.allSettled(fetchPromises);
    return results;
  }

  /**
   * Extracts text content of an XML tag safely.
   */
  private static extractXmlTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Parses Meteotrentino XML response into canonical WeatherObservation.
   */
  static parseXmlPayload(
    stationId: string,
    xmlText: string,
    referenceTime: Date = new Date()
  ): WeatherObservation | null {
    if (!xmlText || xmlText.trim().length === 0) return null;

    const parseNum = (val: string | null): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const n = parseFloat(val.replace(",", "."));
      return isNaN(n) ? null : n;
    };

    const dateStr =
      this.extractXmlTag(xmlText, "data") ||
      this.extractXmlTag(xmlText, "dataOra") ||
      this.extractXmlTag(xmlText, "date");

    const observedAt = dateStr ? normalizeTimestampToUtc(dateStr) : referenceTime.toISOString();

    const speedStr =
      this.extractXmlTag(xmlText, "ventoVelocita") ||
      this.extractXmlTag(xmlText, "velocitaVento") ||
      this.extractXmlTag(xmlText, "windSpeed") ||
      this.extractXmlTag(xmlText, "v_vento");

    const gustStr =
      this.extractXmlTag(xmlText, "ventoRaffica") ||
      this.extractXmlTag(xmlText, "rafficaVento") ||
      this.extractXmlTag(xmlText, "windGust") ||
      this.extractXmlTag(xmlText, "v_raffica");

    const dirStr =
      this.extractXmlTag(xmlText, "ventoDirezione") ||
      this.extractXmlTag(xmlText, "direzioneVento") ||
      this.extractXmlTag(xmlText, "windDirection") ||
      this.extractXmlTag(xmlText, "d_vento");

    const tempStr =
      this.extractXmlTag(xmlText, "temperatura") ||
      this.extractXmlTag(xmlText, "temperature") ||
      this.extractXmlTag(xmlText, "temp");

    const pressStr =
      this.extractXmlTag(xmlText, "pressione") ||
      this.extractXmlTag(xmlText, "pressure");

    const precipStr =
      this.extractXmlTag(xmlText, "precipitazione") ||
      this.extractXmlTag(xmlText, "pioggia") ||
      this.extractXmlTag(xmlText, "precipitation");

    const humidStr =
      this.extractXmlTag(xmlText, "umidita") ||
      this.extractXmlTag(xmlText, "humidity");

    const solarStr =
      this.extractXmlTag(xmlText, "radiazioneSolare") ||
      this.extractXmlTag(xmlText, "radiazione");

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: parseNum(speedStr),
      windGustMs: parseNum(gustStr),
      windDirectionDeg: normalizeDirectionDeg(parseNum(dirStr)),
      temperatureC: parseNum(tempStr),
      pressureHpa: parseNum(pressStr),
      precipitationMm: parseNum(precipStr),
      relativeHumidityPct: parseNum(humidStr),
      solarRadiationWm2: parseNum(solarStr),
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }

  /**
   * JSON structure parsing for fallback / testing.
   */
  static parseObservation(
    stationId: string,
    raw: Record<string, any>,
    referenceTime: Date = new Date()
  ): WeatherObservation | null {
    if (!raw) return null;

    const parseNum = (val: any): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const n = typeof val === "number" ? val : parseFloat(val);
      return isNaN(n) ? null : n;
    };

    const observedAt = raw.dataOra || raw.data
      ? normalizeTimestampToUtc(raw.dataOra || raw.data)
      : referenceTime.toISOString();

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: parseNum(raw.ventoVelocita ?? raw.windSpeed),
      windGustMs: parseNum(raw.ventoRaffica ?? raw.windGust),
      windDirectionDeg: normalizeDirectionDeg(parseNum(raw.ventoDirezione ?? raw.windDirection)),
      temperatureC: parseNum(raw.temperatura ?? raw.temperature),
      relativeHumidityPct: parseNum(raw.umidita ?? raw.humidity),
      pressureHpa: parseNum(raw.pressione ?? raw.pressure),
      precipitationMm: parseNum(raw.precipitazione ?? raw.precipitation),
      solarRadiationWm2: parseNum(raw.radiazioneSolare ?? raw.solarRadiation),
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);

    return {
      ...(partialObs as WeatherObservation),
      quality,
    };
  }
}
