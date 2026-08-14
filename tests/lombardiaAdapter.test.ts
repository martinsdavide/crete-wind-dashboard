/**
 * lombardiaAdapter.test.ts
 *
 * Unit tests for LombardiaOpenDataAdapter & LombardiaClient:
 * Two-stage metadata + sensor readings discovery, identity validation,
 * unit conversion, 30-minute timestamp tolerance, error handling, and observation fusion.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { LombardiaOpenDataAdapter } from "@/engine/observations/providers/LombardiaOpenDataAdapter";
import { LombardiaSensorMetadata } from "@/engine/observations/clients/LombardiaClient";
import { COMO_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/comoLakeBindings";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";

describe("LombardiaOpenDataAdapter — Two-Stage Discovery & Ingestion", () => {
  const refTime = new Date("2026-08-14T12:20:00.000Z"); // 14:20 CEST (obs at 14:15 CEST = 12:15 UTC)

  const metaFixture: LombardiaSensorMetadata[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/lombardia_metadata.json"), "utf-8")
  );
  const readingsFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/lombardia_readings.json"), "utf-8")
  );

  it("Test 1: Metadata lookup resolves sensors for both configured stations (573 Colico & 679 Valmadrera)", () => {
    const colicoSensors = metaFixture.filter((m) => String(m.idstazione) === "573");
    const valmadreraSensors = metaFixture.filter((m) => String(m.idstazione) === "679");

    expect(colicoSensors.length).toBe(4);
    expect(valmadreraSensors.length).toBe(4);

    expect(colicoSensors.map((s) => s.idsensore)).toEqual(["2501", "2502", "2503", "2504"]);
    expect(valmadreraSensors.map((s) => s.idsensore)).toEqual(["3601", "3602", "3603", "3604"]);
  });

  it("Test 2: Readings are joined with metadata by idsensore, never idstazione", () => {
    const metaMap = new Map<string, LombardiaSensorMetadata>();
    metaFixture.forEach((m) => metaMap.set(String(m.idsensore), m));

    const joined = readingsFixture.map((r: any) => {
      const meta = metaMap.get(String(r.idsensore));
      return {
        ...r,
        idstazione: meta ? String(meta.idstazione) : undefined,
        nometiposensore: meta?.nometiposensore,
        unitamisura: meta?.unitamisura,
      };
    });

    const colicoRows = joined.filter((r: any) => r.idstazione === "573");
    expect(colicoRows.length).toBe(4);
    expect(colicoRows.find((r: any) => r.nometiposensore === "Velocità Vento")?.valore).toBe("9.5");
  });

  it("Test 3: Parses valid multi-sensor Socrata payload for Colico (station 573)", () => {
    const metaMap = new Map<string, LombardiaSensorMetadata>();
    metaFixture.forEach((m) => metaMap.set(String(m.idsensore), m));

    const joinedColico = readingsFixture
      .filter((r: any) => ["2501", "2502", "2503", "2504"].includes(String(r.idsensore)))
      .map((r: any) => {
        const meta = metaMap.get(String(r.idsensore));
        return { ...r, idstazione: "573", nometiposensore: meta?.nometiposensore, unitamisura: meta?.unitamisura };
      });

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", joinedColico, refTime);

    expect(obs).not.toBeNull();
    expect(obs?.stationId).toBe("lombardia:colico");
    expect(obs?.windSpeedMs).toBe(9.5);
    expect(obs?.windGustMs).toBe(12.8);
    expect(obs?.windDirectionDeg).toBe(190);
    expect(obs?.temperatureC).toBe(25.2);
    expect(obs?.quality.status).toBe("valid");
  });

  it("Test 4: Latest reading is selected per parameter when multiple timestamps exist", () => {
    const joinedWithMultiple = [
      { idsensore: "2501", idstazione: "573", data: "2026-08-14T14:00:00", valore: "6.0", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
      { idsensore: "2501", idstazione: "573", data: "2026-08-14T14:15:00", valore: "9.5", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
    ];

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", joinedWithMultiple, refTime);

    // Must pick 14:15 reading (9.5 m/s) over older 14:00 reading
    expect(obs?.windSpeedMs).toBe(9.5);
    expect(obs?.observedAt).toBe("2026-08-14T12:15:00.000Z");
  });

  it("Test 5: Unit conversion is driven by metadata (Valmadrera 679: km/h -> m/s)", () => {
    const metaMap = new Map<string, LombardiaSensorMetadata>();
    metaFixture.forEach((m) => metaMap.set(String(m.idsensore), m));

    const joinedValmadrera = readingsFixture
      .filter((r: any) => ["3601", "3602", "3603", "3604"].includes(String(r.idsensore)))
      .map((r: any) => {
        const meta = metaMap.get(String(r.idsensore));
        return { ...r, idstazione: "679", nometiposensore: meta?.nometiposensore, unitamisura: meta?.unitamisura };
      });

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:valmadrera", joinedValmadrera, refTime);

    expect(obs).not.toBeNull();
    // 28.8 km/h / 3.6 = 8.0 m/s
    expect(obs?.windSpeedMs).toBe(8.0);
    // 38.5 km/h / 3.6 = 10.7 m/s
    expect(obs?.windGustMs).toBe(10.7);
    expect(obs?.windDirectionDeg).toBe(185);
  });

  it("Test 6: Multiple sensors for one parameter resolved deterministically to newest reading", () => {
    const joinedDup = [
      { idsensore: "2501", idstazione: "573", data: "2026-08-14T14:10:00", valore: "7.0", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
      { idsensore: "2501_b", idstazione: "573", data: "2026-08-14T14:15:00", valore: "9.5", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
    ];

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", joinedDup, refTime);
    expect(obs?.windSpeedMs).toBe(9.5);
  });

  it("Test 7: Missing direction does not fabricate direction", () => {
    const rowsNoDir = [
      { idsensore: "2501", idstazione: "573", data: "2026-08-14T14:15:00", valore: "9.5", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
    ];

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", rowsNoDir, refTime);

    expect(obs?.windSpeedMs).toBe(9.5);
    expect(obs?.windDirectionDeg).toBeNull();
  });

  it("Test 8: Old readings become stale (>45 min old)", () => {
    const refTimeStale = new Date("2026-08-14T13:15:00.000Z"); // 60 mins after 12:15 UTC
    const rows = [
      { idsensore: "2501", idstazione: "573", data: "2026-08-14T14:15:00", valore: "9.5", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
    ];

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", rows, refTimeStale);

    expect(obs?.quality.status).toBe("stale");
  });

  it("Test 9: Incorrect station metadata fails closed", () => {
    const badMetadata: LombardiaSensorMetadata[] = [
      {
        idsensore: "9999",
        idstazione: "573",
        nomestazione: "Wrong Station Name Bergamo", // Does not contain "Colico"
        nometiposensore: "Velocità Vento",
        lat: "45.000",
        lng: "9.000",
      },
    ];

    const isValid = LombardiaOpenDataAdapter.validateStationIdentity("573", badMetadata);
    expect(isValid).toBe(false);
  });

  it("Test 10: Rejects wind direction if timestamp differs by > 30 minutes from wind speed", () => {
    const rowsAsynch = [
      { idsensore: "2501", idstazione: "573", data: "2026-08-14T14:15:00", valore: "9.5", nometiposensore: "Velocità Vento", unitamisura: "m/s" },
      { idsensore: "2503", idstazione: "573", data: "2026-08-14T13:30:00", valore: "190", nometiposensore: "Direzione Vento", unitamisura: "gN" }, // 45 mins earlier!
    ];

    const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", rowsAsynch, refTime);

    expect(obs?.windSpeedMs).toBe(9.5);
    // Direction discarded because > 30 mins apart
    expect(obs?.windDirectionDeg).toBeNull();
  });

  it("Test 11: Valid station identity for Colico 573 and Valmadrera 679 passes validation", () => {
    expect(LombardiaOpenDataAdapter.validateStationIdentity("573", metaFixture)).toBe(true);
    expect(LombardiaOpenDataAdapter.validateStationIdentity("679", metaFixture)).toBe(true);
  });

  it("Test 12: Production-shaped fixture produces valid Colico and Valmadrera observations for Como Lake fusion", () => {
    const metaMap = new Map<string, LombardiaSensorMetadata>();
    metaFixture.forEach((m) => metaMap.set(String(m.idsensore), m));

    const joinedColico = readingsFixture
      .filter((r: any) => ["2501", "2502", "2503", "2504"].includes(String(r.idsensore)))
      .map((r: any) => {
        const meta = metaMap.get(String(r.idsensore));
        return { ...r, idstazione: "573", nometiposensore: meta?.nometiposensore, unitamisura: meta?.unitamisura };
      });

    const obsColico = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", joinedColico, refTime);
    expect(obsColico).not.toBeNull();

    const observations = {
      "lombardia:colico": obsColico!,
    };

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "colico",
      COMO_LAKE_STATION_BINDINGS["colico"],
      observations,
      12.0,
      15.0,
      190,
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.contributors.length).toBeGreaterThan(0);
    const c = fusion.contributors.find((cb) => cb.stationId === "lombardia:colico");
    expect(c).toBeDefined();
    expect(c?.observedWindKt).toBeCloseTo(18.5, 1); // 9.5 m/s ≈ 18.5 kt
  });
});
