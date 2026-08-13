import { WeatherObservation } from "./types";
import { LombardiaOpenDataAdapter } from "./providers/LombardiaOpenDataAdapter";
import { MeteotrentinoAdapter } from "./providers/MeteotrentinoAdapter";
import { MeteoSwissAdapter } from "./providers/MeteoSwissAdapter";

export interface CacheEntry {
  observation: WeatherObservation;
  cachedAt: number;
}

export class ObservationRepository {
  private static cache: Map<string, CacheEntry> = new Map();
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetches latest observations for given station IDs from memory cache or live providers with 3s timeout.
   */
  static async getObservationsForStations(
    stationIds: string[],
    referenceTime: Date = new Date(),
    requestId?: string
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};
    const missingStationIds: string[] = [];

    const now = Date.now();
    for (const id of stationIds) {
      const cached = this.cache.get(id);
      if (cached && now - cached.cachedAt < this.TTL_MS) {
        results[id] = cached.observation;
      } else {
        missingStationIds.push(id);
        results[id] = cached?.observation || null;
      }
    }

    if (missingStationIds.length === 0) {
      return results;
    }

    // Group missing stations by provider
    const needsLombardia = missingStationIds.some((id) => id.startsWith("lombardia:"));
    const needsMeteotrentino = missingStationIds.some((id) => id.startsWith("meteotrentino:"));
    const needsMeteoSwiss = missingStationIds.some((id) => id.startsWith("meteoswiss:"));

    const providerPromises: Promise<void>[] = [];

    if (needsLombardia) {
      providerPromises.push(
        (async () => {
          try {
            const fetched = await LombardiaOpenDataAdapter.fetchLatestObservations(
              {
                "573": "lombardia:colico",
                "679": "lombardia:valmadrera",
              },
              referenceTime,
              3000,
              requestId
            );
            for (const [stId, obs] of Object.entries(fetched)) {
              if (obs) {
                this.setObservation(obs);
                results[stId] = obs;
              }
            }
          } catch (e) {
            console.warn("Lombardia observation fetch error:", e);
          }
        })()
      );
    }

    if (needsMeteotrentino) {
      providerPromises.push(
        (async () => {
          try {
            const fetched = await MeteotrentinoAdapter.fetchLatestObservations(
              ["T0193", "T0401", "T0354"],
              referenceTime,
              3000,
              requestId
            );
            for (const [stId, obs] of Object.entries(fetched)) {
              if (obs) {
                this.setObservation(obs);
                results[stId] = obs;
              }
            }
          } catch (e) {
            console.warn("Meteotrentino observation fetch error:", e);
          }
        })()
      );
    }

    if (needsMeteoSwiss) {
      providerPromises.push(
        (async () => {
          try {
            const fetched = await MeteoSwissAdapter.fetchLatestObservations(
              { SBO: "meteoswiss:san_bernardino" },
              referenceTime,
              3000,
              requestId
            );
            for (const [stId, obs] of Object.entries(fetched)) {
              if (obs) {
                this.setObservation(obs);
                results[stId] = obs;
              }
            }
          } catch (e) {
            console.warn("MeteoSwiss observation fetch error:", e);
          }
        })()
      );
    }

    await Promise.allSettled(providerPromises);
    return results;
  }

  /**
   * Manually sets or ingests an observation in the cache (useful for testing, webhooks, or background polling).
   */
  static setObservation(obs: WeatherObservation) {
    this.cache.set(obs.stationId, {
      observation: obs,
      cachedAt: Date.now(),
    });
  }

  /**
   * Clears the in-memory cache.
   */
  static clearCache() {
    this.cache.clear();
  }
}
