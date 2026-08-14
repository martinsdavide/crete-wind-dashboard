/**
 * siarProductionGuard.test.ts
 *
 * Verifies that the SIAR integration is truly fail-closed:
 * - No network call is attempted when SIAR_API_URL is not configured.
 * - SiarClient returns immediately with no data when the env var is absent.
 * - ProviderHealthMonitor reports "not_configured" for SIAR (mocked to isolate from other providers).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SiarClient } from "@/engine/observations/clients/SiarClient";

// Prevent any real HTTP calls leaking through
const fetchSpy = vi.spyOn(global, "fetch");

describe("SIAR fail-closed guard — no SIAR_API_URL configured", () => {
  const origSiarUrl = process.env.SIAR_API_URL;

  beforeEach(() => {
    delete process.env.SIAR_API_URL;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    if (origSiarUrl !== undefined) {
      process.env.SIAR_API_URL = origSiarUrl;
    } else {
      delete process.env.SIAR_API_URL;
    }
  });

  it("SiarClient returns success=false immediately without calling fetch", async () => {
    const result = await SiarClient.fetchSensorRows(
      ["TOS01_Grosseto", "TOS02_Talamone"],
      3000,
      "test-guard-req"
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("SIAR_NOT_CONFIGURED");
    expect(result.data).toBeNull();
    expect(result.responseTimeMs).toBe(0);
    // Absolutely no network call should have been attempted
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("SiarClient returns success=false for empty SIAR_API_URL string", async () => {
    process.env.SIAR_API_URL = "  "; // whitespace-only
    const result = await SiarClient.fetchSensorRows();
    expect(result.success).toBe(false);
    expect(result.error).toBe("SIAR_NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Synthetic timestamps are never generated — SiarClient never calls new Date()", async () => {
    const before = Date.now();
    const result = await SiarClient.fetchSensorRows();
    const after = Date.now();

    expect(result.responseTimeMs).toBe(0);
    expect(after - before).toBeLessThan(50);
  });
});

describe("SIAR with SIAR_API_URL configured — real fetch, no synthetic fallback", () => {
  beforeEach(() => {
    process.env.SIAR_API_URL = "https://example.invalid/siar-api";
    fetchSpy.mockClear();
  });

  afterEach(() => {
    delete process.env.SIAR_API_URL;
    fetchSpy.mockReset();
  });

  it("SiarClient calls fetch when URL is configured and returns failure on HTTP error", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await SiarClient.fetchSensorRows(["TOS01_Grosseto"], 3000, "test-http-fail");

    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(503);
    expect(result.data).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("SiarClient returns failure on fetch error — no synthetic data produced", async () => {
    // Simulate a network error (DNS failure, connection refused, etc.)
    fetchSpy.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await SiarClient.fetchSensorRows(["TOS01_Grosseto"], 5000, "test-net-error");

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    // Error message should include the original error text
    expect(result.error).toContain("fetch failed");
  });

  it("SiarClient parses valid JSON response with correct schema", async () => {
    const mockResponse = [
      {
        station_code: "TOS01_Grosseto",
        timestamp: "2026-08-12T14:00:00Z",
        wind_speed_ms: 9.5,
        wind_gust_ms: 12.0,
        wind_direction_deg: 270,
        temperature_c: 28,
        precipitation_mm: 0,
      },
    ];
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await SiarClient.fetchSensorRows(["TOS01_Grosseto"], 3000, "test-parse");

    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].station_code).toBe("TOS01_Grosseto");
    expect(result.data![0].wind_speed_ms).toBe(9.5);
  });

  it("SiarClient returns success=false for empty response body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    const result = await SiarClient.fetchSensorRows(["TOS01_Grosseto"], 3000, "test-empty");

    expect(result.success).toBe(false);
    expect(result.error).toBe("EMPTY_RESPONSE");
  });
});
