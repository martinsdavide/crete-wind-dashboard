import { ObservationLogger } from "../ObservationLogger";
import { ProviderFetchResult } from "./LombardiaClient";

export interface MeteoSwissCsvResult {
  csvText: string | null;
  etag: string | null;
  notModified: boolean;
  assetUrl: string;
}

export class MeteoSwissClient {
  private static cachedAssetUrl: string | null = null;
  private static cachedEtag: string | null = null;
  private static lastDiscoveryMs = 0;

  static readonly STAC_COLLECTION_URL =
    "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-smn";
  static readonly FALLBACK_CSV_URL =
    "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ch.meteoschweiz.ogd-smn_en.csv";

  /**
   * Discovers the current STAC asset URL for all-stations 10-minute SMN CSV data.
   */
  static async resolveCurrentAllStationsAsset(
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<string> {
    const now = Date.now();
    // Cache asset URL for 15 minutes unless invalidated by 404/410
    if (this.cachedAssetUrl && now - this.lastDiscoveryMs < 15 * 60 * 1000) {
      return this.cachedAssetUrl;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(this.STAC_COLLECTION_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "SpotPilot/1.0",
        },
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        // Check assets or links in STAC collection metadata
        if (json?.assets) {
          const csvAsset = Object.values(json.assets).find(
            (a: any) => a?.href && (a.href.endsWith(".csv") || a.type === "text/csv")
          ) as any;
          if (csvAsset?.href) {
            this.cachedAssetUrl = csvAsset.href;
            this.lastDiscoveryMs = now;
            return csvAsset.href;
          }
        }
        if (Array.isArray(json?.links)) {
          const csvLink = json.links.find(
            (l: any) => l?.href && l.href.endsWith(".csv")
          );
          if (csvLink?.href) {
            this.cachedAssetUrl = csvLink.href;
            this.lastDiscoveryMs = now;
            return csvLink.href;
          }
        }
      }
    } catch {}

    clearTimeout(timer);
    this.cachedAssetUrl = this.FALLBACK_CSV_URL;
    this.lastDiscoveryMs = now;
    return this.FALLBACK_CSV_URL;
  }

  /**
   * Clears asset URL cache on 404 / 410 error.
   */
  static invalidateAssetCache() {
    this.cachedAssetUrl = null;
    this.cachedEtag = null;
    this.lastDiscoveryMs = 0;
  }

  /**
   * Fetches latest SMN CSV file from resolved STAC asset URL.
   */
  static async fetchCurrentAllStationsCsv(
    assetUrl?: string,
    etag?: string | null,
    timeoutMs = 3000,
    requestId: string = `req_${Date.now()}`
  ): Promise<ProviderFetchResult<MeteoSwissCsvResult>> {
    const startTime = Date.now();
    const resolvedUrl = assetUrl || (await this.resolveCurrentAllStationsAsset(timeoutMs, requestId));

    ObservationLogger.logRequest("meteoswiss", requestId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: "text/csv, text/plain, */*",
      "User-Agent": "SpotPilot/1.0",
    };
    if (etag || this.cachedEtag) {
      headers["If-None-Match"] = (etag || this.cachedEtag)!;
    }

    try {
      const res = await fetch(resolvedUrl, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;

      if (res.status === 304) {
        return {
          success: true,
          httpStatus: 304,
          responseTimeMs,
          data: {
            csvText: null,
            etag: this.cachedEtag,
            notModified: true,
            assetUrl: resolvedUrl,
          },
        };
      }

      if (res.status === 404 || res.status === 410) {
        this.invalidateAssetCache();
        ObservationLogger.logFailure(
          "meteoswiss",
          "PROVIDER_HTTP_ERROR",
          `STAC asset ${res.status}: ${resolvedUrl}`,
          undefined,
          res.status,
          responseTimeMs,
          requestId
        );
        return {
          success: false,
          httpStatus: res.status,
          responseTimeMs,
          data: null,
          errorCode: "PROVIDER_HTTP_ERROR",
          error: `HTTP ${res.status} asset rotated`,
        };
      }

      if (!res.ok) {
        ObservationLogger.logFailure(
          "meteoswiss",
          "PROVIDER_HTTP_ERROR",
          `HTTP status ${res.status}`,
          undefined,
          res.status,
          responseTimeMs,
          requestId
        );
        return {
          success: false,
          httpStatus: res.status,
          responseTimeMs,
          data: null,
          errorCode: "PROVIDER_HTTP_ERROR",
          error: `HTTP ${res.status}`,
        };
      }

      const newEtag = res.headers.get("etag");
      if (newEtag) this.cachedEtag = newEtag;

      const text = await res.text();
      return {
        success: true,
        httpStatus: res.status,
        responseTimeMs,
        data: {
          csvText: text,
          etag: newEtag,
          notModified: false,
          assetUrl: resolvedUrl,
        },
      };
    } catch (e: any) {
      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;
      const isTimeout = e?.name === "AbortError";
      const errorCode = isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_HTTP_ERROR";
      const errorMsg = isTimeout ? "Request timed out after 3000ms" : (e?.message || "Fetch failed");

      ObservationLogger.logFailure(
        "meteoswiss",
        errorCode,
        errorMsg,
        undefined,
        0,
        responseTimeMs,
        requestId
      );

      return {
        success: false,
        httpStatus: 0,
        responseTimeMs,
        data: null,
        errorCode,
        error: errorMsg,
      };
    }
  }
}

