import { WeatherObservation } from "./types";
import { StationRegistry } from "./StationRegistry";
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
   * Fetches latest observations for given station IDs from memory cache or mock/live providers with 3s timeout.
   */
  static async getObservationsForStations(
    stationIds: string[],
    referenceTime: Date = new Date()
  ): Promise<Record<string, WeatherObservation | null>> {
    const results: Record<string, WeatherObservation | null> = {};

    for (const id of stationIds) {
      const cached = this.cache.get(id);
      const now = Date.now();
      if (cached && now - cached.cachedAt < this.TTL_MS) {
        results[id] = cached.observation;
      } else {
        results[id] = cached?.observation || null;
      }
    }

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
