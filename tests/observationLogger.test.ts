import { describe, it, expect, vi } from "vitest";
import { ObservationLogger, StructuredWeatherLog } from "@/engine/observations/ObservationLogger";

describe("Structured Vercel Logging Tests", () => {
  it("emits expected JSON logs for weather_provider_request", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Temporarily override test env check for testing
    (ObservationLogger as any).isTestEnv = false;

    ObservationLogger.log({
      event: "weather_provider_request",
      provider: "meteotrentino",
      stationId: "T0193",
      requestId: "req_12345",
      startedAt: "2026-08-12T16:00:00Z",
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logStr = consoleSpy.mock.calls[0][0];
    const logObj = JSON.parse(logStr);

    expect(logObj.event).toBe("weather_provider_request");
    expect(logObj.provider).toBe("meteotrentino");
    expect(logObj.stationId).toBe("T0193");
    expect(logObj.requestId).toBe("req_12345");

    consoleSpy.mockRestore();
    (ObservationLogger as any).isTestEnv = true;
  });

  it("sanitizes error messages containing URLs to prevent credentials leakage", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    (ObservationLogger as any).isTestEnv = false;

    ObservationLogger.logFailure(
      "regione-lombardia",
      "PROVIDER_HTTP_ERROR",
      "Failed to fetch from https://dati.lombardia.it/resource/647i-nhxk.json?token=my_secret_token",
      "573",
      500,
      150,
      "req_999"
    );

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logStr = consoleSpy.mock.calls[0][0];
    const logObj = JSON.parse(logStr);

    expect(logObj.error).not.toContain("my_secret_token");
    expect(logObj.error).toContain("[URL]");

    consoleSpy.mockRestore();
    (ObservationLogger as any).isTestEnv = true;
  });
});
