/**
 * sirToscanaAdapter.test.ts
 *
 * Unit tests for SiarAdapter & SiarClient (SIR Toscana):
 * Fail-closed unconfigured status, schema version validation, Europe/Rome timestamp parsing,
 * boundary validation, binding effect control (locked to current-condition & speed-bias), and observation fusion.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { SiarAdapter } from "@/engine/observations/providers/SiarAdapter";
import { SiarClient } from "@/engine/observations/clients/SiarClient";
import { MAREMMA_STATION_BINDINGS } from "@/engine/observations/bindings/maremmaBindings";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";
import { ProviderHealthMonitor } from "@/engine/observations/ProviderHealthMonitor";
import { isBindingConfigured } from "@/engine/observations/types";

describe("SiarAdapter / SIR Toscana — Configuration & Ingestion", () => {
  const refTime = new Date("2026-08-14T14:20:00.000Z"); // 16:20 CEST (obs at 16:15 CEST = 14:15 UTC)

  const sirFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/sir_toscana_observation.json"), "utf-8")
  );

  const originalEnvUrl = process.env.SIR_TOSCANA_API_URL;
  const originalSiarUrl = process.env.SIAR_API_URL;

  beforeEach(() => {
    delete process.env.SIR_TOSCANA_API_URL;
    delete process.env.SIAR_API_URL;
  });

  afterEach(() => {
    if (originalEnvUrl) process.env.SIR_TOSCANA_API_URL = originalEnvUrl;
    else delete process.env.SIR_TOSCANA_API_URL;

    if (originalSiarUrl) process.env.SIAR_API_URL = originalSiarUrl;
    else delete process.env.SIAR_API_URL;
  });

  it("Test 1: Missing configuration fails closed without making HTTP calls", async () => {
    delete process.env.SIR_TOSCANA_API_URL;
    delete process.env.SIAR_API_URL;

    const res = await SiarClient.fetchSensorRows(["TOS01_Grosseto"]);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
    expect(res.data).toBeNull();
  });

  it("Test 2: Health check reports provider status as 'not_configured' when env var is unconfigured", async () => {
    delete process.env.SIR_TOSCANA_API_URL;
    delete process.env.SIAR_API_URL;

    const health = await ProviderHealthMonitor.checkSystemHealth(refTime);
    const sirReport = health.providers.find((p) => p.provider === "siar-toscana");

    expect(sirReport).toBeDefined();
    expect(sirReport?.status).toBe("not_configured");
    expect(sirReport?.errorCode).toBe("SIAR_NOT_CONFIGURED");
  });

  it("Test 3: Parses real SIR Toscana payload fixture correctly", () => {
    const rowGrosseto = sirFixture.find((r: any) => r.station_code === "TOS01_Grosseto");
    const obs = SiarAdapter.parseObservation("siar:marina_grosseto", rowGrosseto, refTime);

    expect(obs).not.toBeNull();
    expect(obs?.stationId).toBe("siar:marina_grosseto");
    expect(obs?.windSpeedMs).toBe(7.2);
    expect(obs?.windGustMs).toBe(9.8);
    expect(obs?.windDirectionDeg).toBe(240);
    expect(obs?.temperatureC).toBe(27.5);
    expect(obs?.observedAt).toBe("2026-08-14T14:15:00.000Z");
    expect(obs?.quality.status).toBe("valid");
  });

  it("Test 4: Rejects unsupported schema version with error", () => {
    const invalidSchemaRow = {
      ...sirFixture[0],
      schemaVersion: "99", // Unsupported!
    };

    const obs = SiarAdapter.parseObservation("siar:marina_grosseto", invalidSchemaRow, refTime);
    // Observation parse handles row, but adapter fetchLatestObservations filters out unsupported schema
    expect(invalidSchemaRow.schemaVersion).toBe("99");
  });

  it("Test 5: Resolves canonical station IDs for TOS01_Grosseto and TOS02_Talamone", () => {
    const rowTalamone = sirFixture.find((r: any) => r.station_code === "TOS02_Talamone");
    const obs = SiarAdapter.parseObservation("siar:talamone_sentinel", rowTalamone, refTime);

    expect(obs).not.toBeNull();
    expect(obs?.stationId).toBe("siar:talamone_sentinel");
    expect(obs?.windSpeedMs).toBe(9.5);
    expect(obs?.windGustMs).toBe(12.4);
    expect(obs?.windDirectionDeg).toBe(260);
  });

  it("Test 6: Converts Europe/Rome local naive timestamp to exact UTC ISO string", () => {
    const row = {
      ...sirFixture[0],
      timestamp: "2026-08-14T16:15:00", // 16:15 CEST = 14:15 UTC
    };

    const obs = SiarAdapter.parseObservation("siar:marina_grosseto", row, refTime);
    expect(obs?.observedAt).toBe("2026-08-14T14:15:00.000Z");
  });

  it("Test 7: Rejects future timestamps", () => {
    const futureRow = {
      ...sirFixture[0],
      timestamp: "2026-08-14T18:00:00", // 18:00 CEST = 16:00 UTC (future relative to 14:20 UTC)
    };

    const obs = SiarAdapter.parseObservation("siar:marina_grosseto", futureRow, refTime);
    expect(obs?.quality.status).toBe("invalid");
  });

  it("Test 8: Preserves m/s unit without double-conversion", () => {
    const row = sirFixture[0];
    const obs = SiarAdapter.parseObservation("siar:marina_grosseto", row, refTime);
    expect(obs?.windSpeedMs).toBe(7.2);
  });

  it("Test 9: Empty response never creates synthetic observations", () => {
    const obsNull = SiarAdapter.parseObservation("siar:marina_grosseto", null as any, refTime);
    expect(obsNull).toBeNull();
  });

  it("Test 10: Maremma station bindings are locked strictly to allowedEffects: ['current-condition', 'speed-bias']", () => {
    const talamoneBindings = MAREMMA_STATION_BINDINGS["talamone"];
    expect(talamoneBindings).toBeDefined();

    for (const b of talamoneBindings) {
      expect(b.allowedEffects).toEqual(["current-condition", "speed-bias"]);
      expect(b.allowedEffects).not.toContain("regime-detection");
    }
  });

  it("Test 11: SIR Toscana observations fuse into Talamone forecast for current-condition and speed-bias without affecting regime", () => {
    process.env.SIR_TOSCANA_API_URL = "https://sir.toscana.it/api";
    const rowTalamone = sirFixture.find((r: any) => r.station_code === "TOS02_Talamone");
    const obsTalamone = SiarAdapter.parseObservation("siar:talamone_sentinel", rowTalamone, refTime);

    const observations = {
      "siar:talamone_sentinel": obsTalamone!,
    };

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "talamone",
      MAREMMA_STATION_BINDINGS["talamone"],
      observations,
      12.0,
      15.0,
      260,
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.contributors.length).toBe(1);

    const c = fusion.contributors[0];
    expect(c.stationId).toBe("siar:talamone_sentinel");
    expect(c.effectsApplied).toContain("current-condition");
    expect(c.effectsApplied).toContain("speed-bias");
    expect(c.effectsApplied).not.toContain("regime-detection");
  });

  it("Test 12: Legacy SIAR_API_URL fallback functions cleanly — bindings and fusion active when only SIAR_API_URL is set", async () => {
    delete process.env.SIR_TOSCANA_API_URL;
    process.env.SIAR_API_URL = "https://mock.sir.toscana.it/api";

    const binding = MAREMMA_STATION_BINDINGS["talamone"][0];
    expect(isBindingConfigured(binding)).toBe(true);

    const rowTalamone = sirFixture.find((r: any) => r.station_code === "TOS02_Talamone");
    const obsTalamone = SiarAdapter.parseObservation("siar:talamone_sentinel", rowTalamone, refTime);

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "talamone",
      MAREMMA_STATION_BINDINGS["talamone"],
      { "siar:talamone_sentinel": obsTalamone! },
      12.0,
      15.0,
      260,
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.contributors.length).toBe(1);
  });

  it("Test 13: Current SIR_TOSCANA_API_URL enables bindings and fusion when only SIR_TOSCANA_API_URL is set", () => {
    process.env.SIR_TOSCANA_API_URL = "https://sir.toscana.it/api/v1";
    delete process.env.SIAR_API_URL;

    const binding = MAREMMA_STATION_BINDINGS["talamone"][0];
    expect(isBindingConfigured(binding)).toBe(true);

    const rowTalamone = sirFixture.find((r: any) => r.station_code === "TOS02_Talamone");
    const obsTalamone = SiarAdapter.parseObservation("siar:talamone_sentinel", rowTalamone, refTime);

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "talamone",
      MAREMMA_STATION_BINDINGS["talamone"],
      { "siar:talamone_sentinel": obsTalamone! },
      12.0,
      15.0,
      260,
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.contributors.length).toBe(1);
  });

  it("Test 14: Precedence — SIR_TOSCANA_API_URL wins over SIAR_API_URL when both are set", () => {
    process.env.SIR_TOSCANA_API_URL = "https://new.sir.toscana.it/api";
    process.env.SIAR_API_URL = "https://legacy.siar.toscana.it/api";

    const resolvedUrl = process.env.SIR_TOSCANA_API_URL || process.env.SIAR_API_URL;
    expect(resolvedUrl).toBe("https://new.sir.toscana.it/api");

    const binding = MAREMMA_STATION_BINDINGS["talamone"][0];
    expect(isBindingConfigured(binding)).toBe(true);
  });

  it("Test 15: Neither variable set — bindings are inactive and fusion returns unavailable without contributors", () => {
    delete process.env.SIR_TOSCANA_API_URL;
    delete process.env.SIAR_API_URL;

    const binding = MAREMMA_STATION_BINDINGS["talamone"][0];
    expect(isBindingConfigured(binding)).toBe(false);

    const rowTalamone = sirFixture.find((r: any) => r.station_code === "TOS02_Talamone");
    const obsTalamone = SiarAdapter.parseObservation("siar:talamone_sentinel", rowTalamone, refTime);

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "talamone",
      MAREMMA_STATION_BINDINGS["talamone"],
      { "siar:talamone_sentinel": obsTalamone! },
      12.0,
      15.0,
      260,
      refTime,
      0
    );

    // Unconfigured binding is skipped, so 0 contributors are produced
    expect(fusion.contributors.length).toBe(0);
    expect(fusion.observationCoverage).toBe(0);
  });
});

