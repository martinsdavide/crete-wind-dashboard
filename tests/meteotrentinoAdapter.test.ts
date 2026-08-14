/**
 * meteotrentinoAdapter.test.ts
 *
 * Unit tests for MeteotrentinoAdapter:
 * Section-aware XML parsing, Europe/Rome DST timezone handling, unit conversion,
 * quality control, and observation fusion integration.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { MeteotrentinoAdapter } from "@/engine/observations/providers/MeteotrentinoAdapter";
import { parseLocalTimeToUtc } from "@/engine/observations/ObservationNormalizer";
import { GARDA_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/gardaLakeBindings";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";

describe("MeteotrentinoAdapter — Section-Aware Parsing & Timezone Handling", () => {
  const refTimeSummer = new Date("2026-08-14T14:20:00.000Z"); // UTC in summer (16:20 CEST)
  const fixtureT0193 = fs.readFileSync(
    path.join(__dirname, "fixtures/meteotrentino_T0193.xml"),
    "utf-8"
  );
  const fixtureT0401 = fs.readFileSync(
    path.join(__dirname, "fixtures/meteotrentino_T0401.xml"),
    "utf-8"
  );
  const fixtureT0354 = fs.readFileSync(
    path.join(__dirname, "fixtures/meteotrentino_T0354.xml"),
    "utf-8"
  );

  it("Test 1: Selects the latest <vento_al_suolo> record (14:15 over 14:00 in T0193 fixture)", () => {
    // 14:15 CEST = 12:15 UTC. Reference time = 12:20 UTC (5 min age)
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", fixtureT0193, refTime);

    expect(obs).not.toBeNull();
    // Latest record (14:15 CEST => 12:15:00.000Z)
    expect(obs?.observedAt).toBe("2026-08-14T12:15:00.000Z");
  });

  it("Test 2: Keeps speed, gust, direction, and timestamp strictly from the exact same record", () => {
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", fixtureT0193, refTime);

    expect(obs).not.toBeNull();
    // 14:15 record: v=9.9 m/s, vmax=12.7 m/s, d=192°
    expect(obs?.windSpeedMs).toBe(9.9);
    expect(obs?.windGustMs).toBe(12.7);
    expect(obs?.windDirectionDeg).toBe(192);
  });

  it("Test 3: Parses <v>, <vmax>, and <d> correctly", () => {
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0401", fixtureT0401, refTime);

    expect(obs).not.toBeNull();
    // T0401: v=8.2, vmax=10.5, d=180
    expect(obs?.windSpeedMs).toBe(8.2);
    expect(obs?.windGustMs).toBe(10.5);
    expect(obs?.windDirectionDeg).toBe(180);
  });

  it("Test 4: Converts Europe/Rome timestamps correctly during summer (UTC+2) and winter (UTC+1)", () => {
    // Summer date: 2026-08-14 14:15:00 CEST => 12:15:00.000Z UTC
    const summerUtc = parseLocalTimeToUtc("2026-08-14T14:15:00", "Europe/Rome");
    expect(summerUtc).toBe("2026-08-14T12:15:00.000Z");

    // Winter date: 2026-01-14 14:15:00 CET => 13:15:00.000Z UTC
    const winterUtc = parseLocalTimeToUtc("2026-01-14T14:15:00", "Europe/Rome");
    expect(winterUtc).toBe("2026-01-14T13:15:00.000Z");
  });

  it("Test 5: Handles comma decimal values (e.g., '9,9' => 9.9)", () => {
    const xmlWithComma = `
      <stazione_dati>
        <venti>
          <vento_al_suolo UM_VV="m/s" UM_VVMAX="m/s" UM_DV="gN">
            <data>2026-08-14T14:15:00</data>
            <v>9,9</v>
            <vmax>12,7</vmax>
            <d>192</d>
          </vento_al_suolo>
        </venti>
      </stazione_dati>
    `;
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", xmlWithComma, refTime);

    expect(obs?.windSpeedMs).toBe(9.9);
    expect(obs?.windGustMs).toBe(12.7);
  });

  it("Test 6: Ignores malformed or future records (>15 min in future)", () => {
    const xmlWithFuture = `
      <stazione_dati>
        <venti>
          <vento_al_suolo>
            <data>2026-08-14T18:00:00</data>
            <v>25.0</v>
            <vmax>30.0</vmax>
            <d>180</d>
          </vento_al_suolo>
          <vento_al_suolo>
            <data>2026-08-14T14:15:00</data>
            <v>9.9</v>
            <vmax>12.7</vmax>
            <d>192</d>
          </vento_al_suolo>
        </venti>
      </stazione_dati>
    `;
    // Ref time is 12:20 UTC (14:20 CEST). 18:00 CEST is > 3 hours in future!
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", xmlWithFuture, refTime);

    // Must ignore 18:00 record and select valid 14:15 record (9.9 m/s)
    expect(obs?.windSpeedMs).toBe(9.9);
    expect(obs?.observedAt).toBe("2026-08-14T12:15:00.000Z");
  });

  it("Test 7: Returns context-only data when a station has no wind section", () => {
    const xmlNoWind = `
      <stazione_dati>
        <temperatura_aria>
          <temperatura UM="°C">
            <data>2026-08-14T14:15:00</data>
            <t>26.4</t>
          </temperatura>
        </temperatura_aria>
      </stazione_dati>
    `;
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", xmlNoWind, refTime);

    expect(obs).not.toBeNull();
    expect(obs?.windSpeedMs).toBeNull();
    expect(obs?.temperatureC).toBe(26.4);
    expect(obs?.quality.status).toBe("valid");
  });

  it("Test 8: Does not fall back to document-level date for wind", () => {
    const xmlDocDateOnly = `
      <stazione_dati>
        <data>2026-08-14T16:00:00</data>
        <venti>
          <vento_al_suolo>
            <data>2026-08-14T14:15:00</data>
            <v>9.9</v>
            <d>192</d>
          </vento_al_suolo>
        </venti>
      </stazione_dati>
    `;
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", xmlDocDateOnly, refTime);

    expect(obs?.observedAt).toBe("2026-08-14T12:15:00.000Z"); // From <vento_al_suolo><data>, NOT document <data>
  });

  it("Test 9: Marks genuinely old observations stale", () => {
    // 14:15 CEST observedAt = 12:15 UTC. Reference time = 13:15 UTC (60 min age => status 'stale')
    const refTimeStale = new Date("2026-08-14T13:15:00.000Z");
    const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", fixtureT0193, refTimeStale);

    expect(obs).not.toBeNull();
    expect(obs?.quality.status).toBe("stale");
    expect(obs?.quality.score).toBeLessThan(0.4);
  });

  it("Test 10: Produces an active Torbole contributor from a fresh T0193 fixture", () => {
    const refTime = new Date("2026-08-14T12:20:00.000Z");
    const obsT0193 = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", fixtureT0193, refTime);

    expect(obsT0193).not.toBeNull();

    const observations = {
      "meteotrentino:T0193": obsT0193!,
    };

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      GARDA_LAKE_STATION_BINDINGS["torbole"],
      observations,
      12.0, // forecast wind
      15.0, // forecast gust
      180,  // forecast dir
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.contributors.length).toBeGreaterThan(0);
    const c = fusion.contributors.find((cb) => cb.stationId === "meteotrentino:T0193");
    expect(c).toBeDefined();
    expect(c?.observedWindKt).toBeCloseTo(19.2, 1); // 9.9 m/s ≈ 19.2 kt
    expect(c?.observedDirectionDeg).toBe(192);
  });
});
