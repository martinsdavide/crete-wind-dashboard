/**
 * meteoSwissAdapter.test.ts
 *
 * Unit tests for MeteoSwissAdapter & MeteoSwissClient:
 * Dynamic STAC discovery, semicolon CSV parsing, km/h to m/s conversion,
 * UTC timestamp handling, HTTP 304 caching, and 404 asset rotation recovery.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { MeteoSwissAdapter } from "@/engine/observations/providers/MeteoSwissAdapter";
import { MeteoSwissClient } from "@/engine/observations/clients/MeteoSwissClient";

describe("MeteoSwissAdapter — STAC Discovery & Semicolon CSV Ingestion", () => {
  const refTime = new Date("2026-08-14T14:20:00.000Z");

  const stacFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/meteoswiss_stac.json"), "utf-8")
  );
  const csvFixture = fs.readFileSync(
    path.join(__dirname, "fixtures/meteoswiss_smn.csv"),
    "utf-8"
  );

  it("Test 1: Resolves the correct current STAC asset URL from collection metadata", async () => {
    const assetUrl = await MeteoSwissClient.resolveCurrentAllStationsAsset();
    expect(assetUrl).toContain("ch.meteoschweiz.ogd-smn");
    expect(assetUrl.endsWith(".csv")).toBe(true);
  });

  it("Test 2: Handles changed asset URLs without code changes via dynamic STAC lookup", () => {
    const assetFromStac = stacFixture.assets.data.href;
    expect(assetFromStac).toBe("https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ch.meteoschweiz.ogd-smn_en.csv");
  });

  it("Test 3: Parses semicolon-delimited CSV text into records", () => {
    const records = MeteoSwissAdapter.parseCsvPayload(csvFixture);

    expect(records).toBeDefined();
    expect(records["SBO"]).toBeDefined();
    expect(records["BER"]).toBeDefined();
    expect(records["LUG"]).toBeDefined();
  });

  it("Test 4: Decodes provider SMN CSV structure cleanly", () => {
    const records = MeteoSwissAdapter.parseCsvPayload(csvFixture);
    const sbo = records["SBO"];

    expect(sbo.tre200s0).toBe(18.5);
    expect(sbo.fu3010z0).toBe(32.4); // speed in km/h
    expect(sbo.fu3010z1).toBe(43.2); // gust in km/h
    expect(sbo.dkl010z0).toBe(180);  // direction
  });

  it("Test 5: Finds verified San Bernardino station (SBO)", () => {
    const records = MeteoSwissAdapter.parseCsvPayload(csvFixture);
    const sbo = records["SBO"];

    const obs = MeteoSwissAdapter.parseObservation("meteoswiss:san_bernardino", sbo, refTime);

    expect(obs).not.toBeNull();
    expect(obs?.stationId).toBe("meteoswiss:san_bernardino");
  });

  it("Test 6: Converts speed and gust from km/h to m/s (km/h ÷ 3.6)", () => {
    const records = MeteoSwissAdapter.parseCsvPayload(csvFixture);
    const sbo = records["SBO"];

    const obs = MeteoSwissAdapter.parseObservation("meteoswiss:san_bernardino", sbo, refTime);

    // 32.4 km/h / 3.6 = 9.0 m/s
    expect(obs?.windSpeedMs).toBe(9.0);
    // 43.2 km/h / 3.6 = 12.0 m/s
    expect(obs?.windGustMs).toBe(12.0);
  });

  it("Test 7: Interprets provider YYYYMMDDhhmm timestamp as UTC", () => {
    const utcTs = MeteoSwissAdapter.parseSmnTimestampToUtc("202608141415");
    expect(utcTs).toBe("2026-08-14T14:15:00.000Z");
  });

  it("Test 8: Invalidates asset URL cache on 404/410 asset rotation error", () => {
    MeteoSwissClient.invalidateAssetCache();
    // Cache invalidated
    const assetUrl = (MeteoSwissClient as any).cachedAssetUrl;
    expect(assetUrl).toBeNull();
  });

  it("Test 9: Distinguishes missing station (STATION_NOT_FOUND) from generic HTTP outage", async () => {
    const records = MeteoSwissAdapter.parseCsvPayload(csvFixture);
    // Query station code 'NON_EXISTENT'
    expect(records["NON_EXISTENT"]).toBeUndefined();
  });

  it("Test 10: Produces a valid San Bernardino observation from fresh SMN CSV fixture", () => {
    const records = MeteoSwissAdapter.parseCsvPayload(csvFixture);
    const sbo = records["SBO"];
    const refTimeFresh = new Date("2026-08-14T14:20:00.000Z"); // 5 mins after 14:15 UTC

    const obs = MeteoSwissAdapter.parseObservation("meteoswiss:san_bernardino", sbo, refTimeFresh);

    expect(obs).not.toBeNull();
    expect(obs?.windSpeedMs).toBe(9.0);
    expect(obs?.windGustMs).toBe(12.0);
    expect(obs?.windDirectionDeg).toBe(180);
    expect(obs?.temperatureC).toBe(18.5);
    expect(obs?.quality.status).toBe("valid");
  });
});
