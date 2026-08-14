import { WeatherObservation } from "../types";
import { ObservationQualityControl } from "../ObservationQualityControl";
import { parseLocalTimeToUtc, normalizeDirectionDeg, kmhToMs, knotsToMs } from "../ObservationNormalizer";
import { MeteotrentinoClient } from "../clients/MeteotrentinoClient";
import { ObservationLogger } from "../ObservationLogger";

interface MeteotrentinoWindRecord {
  timestamp: string; // UTC ISO string
  rawTimestamp: string;
  windSpeedMs: number | null;
  windGustMs: number | null;
  windDirectionDeg: number | null;
}

interface MeteotrentinoValueRecord {
  timestamp: string; // UTC ISO string
  value: number | null;
}

export class MeteotrentinoAdapter {
  /**
   * Fetches latest observations from Meteotrentino open data endpoints.
   */
  static async fetchLatestObservations(
    stationCodes: string[] = ["T0193", "T0401", "T0354"],
    referenceTime: Date = new Date(),
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};

    const fetchPromises = stationCodes.map(async (code) => {
      const canonicalId = `meteotrentino:${code}`;
      const startTime = Date.now();
      const fetchRes = await MeteotrentinoClient.fetchStationXml(code, timeoutMs, requestId);
      const responseTimeMs = fetchRes.responseTimeMs || (Date.now() - startTime);

      if (fetchRes.success && fetchRes.data) {
        const obs = this.parseXmlPayload(canonicalId, fetchRes.data, referenceTime, responseTimeMs, fetchRes.httpStatus);
        if (obs) {
          results[canonicalId] = obs;
        }
      } else {
        // Log HTTP / connectivity failure
        ObservationLogger.logEvent({
          event: "weather_provider_result",
          provider: "meteotrentino",
          stationId: code,
          status: fetchRes.errorCode || "http_error",
          httpStatus: fetchRes.httpStatus || 0,
          recordsReceived: 0,
          selectedObservedAt: null,
          ageMinutes: null,
          hasWindSpeed: false,
          hasWindGust: false,
          hasDirection: false,
          responseTimeMs,
          errorCode: fetchRes.errorCode,
        });
      }
    });

    await Promise.allSettled(fetchPromises);
    return results;
  }

  /**
   * Helper to convert speed values based on unit attribute.
   */
  private static parseSpeedWithUnit(valStr: string | null, unitStr: string | null): number | null {
    if (!valStr) return null;
    const n = parseFloat(valStr.replace(",", "."));
    if (isNaN(n)) return null;

    const unit = (unitStr || "m/s").toLowerCase().trim();
    if (unit === "km/h" || unit === "kmh") {
      return kmhToMs(n);
    }
    if (unit === "knots" || unit === "kt" || unit === "kts") {
      return knotsToMs(n);
    }
    return n; // default m/s
  }

  /**
   * Section-aware parsing of Meteotrentino XML response into canonical WeatherObservation.
   */
  static parseXmlPayload(
    stationId: string,
    xmlText: string,
    referenceTime: Date = new Date(),
    responseTimeMs = 0,
    httpStatus = 200
  ): WeatherObservation | null {
    if (!xmlText || xmlText.trim().length === 0) return null;

    const stationCode = stationId.replace("meteotrentino:", "");
    const parseNum = (val: string | null): number | null => {
      if (!val) return null;
      const n = parseFloat(val.replace(",", "."));
      return isNaN(n) ? null : n;
    };

    // 1. Extract and parse all <vento_al_suolo> section elements
    const windBlockRegex = /<vento_al_suolo\b([^>]*)>([\s\S]*?)<\/vento_al_suolo>/gi;
    const windRecords: MeteotrentinoWindRecord[] = [];
    let match: RegExpExecArray | null;

    while ((match = windBlockRegex.exec(xmlText)) !== null) {
      const attributes = match[1];
      const content = match[2];

      const dataMatch = content.match(/<data[^>]*>([^<]+)<\/data>/i);
      const speedMatch = content.match(/<v[^>]*>([^<]+)<\/v>/i);
      const gustMatch = content.match(/<vmax[^>]*>([^<]+)<\/vmax>/i);
      const dirMatch = content.match(/<d[^>]*>([^<]+)<\/d>/i);

      if (!dataMatch) continue;

      const rawTimestamp = dataMatch[1].trim();
      const utcTimestamp = parseLocalTimeToUtc(rawTimestamp, "Europe/Rome");

      // Extract units from attributes if present
      const umVvMatch = attributes.match(/UM_VV="([^"]+)"/i);
      const umVmaxMatch = attributes.match(/UM_VVMAX="([^"]+)"/i);

      const speedMs = this.parseSpeedWithUnit(speedMatch ? speedMatch[1].trim() : null, umVvMatch ? umVvMatch[1] : null);
      const gustMs = this.parseSpeedWithUnit(gustMatch ? gustMatch[1].trim() : null, umVmaxMatch ? umVmaxMatch[1] : null);
      const dirDeg = dirMatch ? normalizeDirectionDeg(parseNum(dirMatch[1].trim())) : null;

      // Filter: valid timestamp, not materially in future (max 15 mins ahead of referenceTime), has wind speed or dir
      const recordTimeMs = new Date(utcTimestamp).getTime();
      const maxFutureMs = referenceTime.getTime() + 15 * 60 * 1000;

      if (!isNaN(recordTimeMs) && recordTimeMs <= maxFutureMs && (speedMs !== null || dirDeg !== null)) {
        windRecords.push({
          timestamp: utcTimestamp,
          rawTimestamp,
          windSpeedMs: speedMs,
          windGustMs: gustMs,
          windDirectionDeg: dirDeg,
        });
      }
    }

    // Fallback for legacy flat XML tags if no <vento_al_suolo> records exist
    if (windRecords.length === 0) {
      const extractXmlTag = (tag: string): string | null => {
        const regex = new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, "i");
        const m = xmlText.match(regex);
        return m ? m[1].trim() : null;
      };

      const speedStr = extractXmlTag("ventoVelocita") || extractXmlTag("velocitaVento") || extractXmlTag("windSpeed") || extractXmlTag("v_vento");
      const gustStr = extractXmlTag("ventoRaffica") || extractXmlTag("rafficaVento") || extractXmlTag("windGust") || extractXmlTag("v_raffica");
      const dirStr = extractXmlTag("ventoDirezione") || extractXmlTag("direzioneVento") || extractXmlTag("windDirection") || extractXmlTag("d_vento");
      const dateStr = extractXmlTag("data") || extractXmlTag("dataOra") || extractXmlTag("date");

      if (speedStr || gustStr || dirStr) {
        const utcTs = dateStr ? parseLocalTimeToUtc(dateStr, "Europe/Rome") : referenceTime.toISOString();
        windRecords.push({
          timestamp: utcTs,
          rawTimestamp: dateStr || "",
          windSpeedMs: parseNum(speedStr),
          windGustMs: parseNum(gustStr),
          windDirectionDeg: dirStr ? normalizeDirectionDeg(parseNum(dirStr)) : null,
        });
      }
    }

    // Sort wind records by timestamp descending (newest first)
    windRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const selectedWindRecord = windRecords.length > 0 ? windRecords[0] : null;

    const observedAt = selectedWindRecord ? selectedWindRecord.timestamp : referenceTime.toISOString();
    const targetMs = new Date(observedAt).getTime();

    // Helper for matching non-wind sections closest to targetMs within 30 mins
    const parseNonWindSection = (tagSection: string, tagValue: string): number | null => {
      const sectionRegex = new RegExp(`<${tagSection}\\b[^>]*>([\\s\\S]*?)<\\/${tagSection}>`, "gi");
      const records: MeteotrentinoValueRecord[] = [];
      let secMatch: RegExpExecArray | null;

      while ((secMatch = sectionRegex.exec(xmlText)) !== null) {
        const content = secMatch[1];
        const dMatch = content.match(/<data[^>]*>([^<]+)<\/data>/i);
        const vMatch = content.match(new RegExp(`<${tagValue}[^>]*>([^<]+)<\\/${tagValue}>`, "i"));

        if (dMatch && vMatch) {
          const utcTs = parseLocalTimeToUtc(dMatch[1].trim(), "Europe/Rome");
          const val = parseNum(vMatch[1].trim());
          if (val !== null && !isNaN(new Date(utcTs).getTime())) {
            records.push({ timestamp: utcTs, value: val });
          }
        }
      }

      if (records.length === 0) return null;

      // Select value closest to targetMs within 30 mins (1800000 ms)
      let bestValue: number | null = null;
      let minDiff = 1800000;

      for (const r of records) {
        const diff = Math.abs(new Date(r.timestamp).getTime() - targetMs);
        if (diff <= minDiff) {
          minDiff = diff;
          bestValue = r.value;
        }
      }

      return bestValue;
    };

    const extractXmlTag = (tag: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, "i");
      const m = xmlText.match(regex);
      return m ? m[1].trim() : null;
    };

    const tempC = parseNonWindSection("temperatura_aria", "t") ?? parseNum(extractXmlTag("temperatura") || extractXmlTag("temp"));
    const rhPct = parseNonWindSection("umidita_relativa", "v") ?? parseNum(extractXmlTag("umidita") || extractXmlTag("humidity"));
    const precipMm = parseNonWindSection("precipitazione", "v") ?? parseNum(extractXmlTag("precipitazione") || extractXmlTag("pioggia"));
    const solarWm2 = parseNonWindSection("radiazione", "v") ?? parseNum(extractXmlTag("radiazioneSolare") || extractXmlTag("radiazione"));
    const pressHpa = parseNum(extractXmlTag("pressione") || extractXmlTag("pressure"));

    const partialObs: Partial<WeatherObservation> = {
      stationId,
      observedAt,
      receivedAt: referenceTime.toISOString(),
      windSpeedMs: selectedWindRecord ? selectedWindRecord.windSpeedMs : null,
      windGustMs: selectedWindRecord ? selectedWindRecord.windGustMs : null,
      windDirectionDeg: selectedWindRecord ? selectedWindRecord.windDirectionDeg : null,
      temperatureC: tempC,
      relativeHumidityPct: rhPct,
      pressureHpa: pressHpa,
      precipitationMm: precipMm,
      solarRadiationWm2: solarWm2,
    };

    const quality = ObservationQualityControl.validateObservation(partialObs, referenceTime);
    const ageMinutes = Math.round((referenceTime.getTime() - new Date(observedAt).getTime()) / (60 * 1000));

    // Structured logging for weather_provider_result
    ObservationLogger.logEvent({
      event: "weather_provider_result",
      provider: "meteotrentino",
      stationId: stationCode,
      status: selectedWindRecord ? "success" : "partial",
      httpStatus,
      recordsReceived: windRecords.length,
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
      ? parseLocalTimeToUtc(raw.dataOra || raw.data, "Europe/Rome")
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

