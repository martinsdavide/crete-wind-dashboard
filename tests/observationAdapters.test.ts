import { describe, it, expect } from "vitest";
import { LombardiaOpenDataAdapter, LombardiaSensorRow } from "@/engine/observations/providers/LombardiaOpenDataAdapter";
import { MeteotrentinoAdapter } from "@/engine/observations/providers/MeteotrentinoAdapter";
import { MeteoSwissAdapter, MeteoSwissRecord } from "@/engine/observations/providers/MeteoSwissAdapter";

describe("Observation Adapters Contract Tests", () => {
  const refTime = new Date("2026-08-12T10:00:00.000Z");

  describe("LombardiaOpenDataAdapter", () => {
    it("parses valid multi-sensor Socrata payload for Colico (station 573)", () => {
      const rows: LombardiaSensorRow[] = [
        {
          idstazione: "573",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Velocità Vento",
          valore: "7.5",
          unitamisura: "m/s",
        },
        {
          idstazione: "573",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Raffica Vento",
          valore: "10.2",
          unitamisura: "m/s",
        },
        {
          idstazione: "573",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Direzione Vento",
          valore: "15",
          unitamisura: "Gradi",
        },
        {
          idstazione: "573",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Temperatura",
          valore: "23.4",
          unitamisura: "°C",
        },
      ];

      const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", rows, refTime);

      expect(obs).not.toBeNull();
      expect(obs?.stationId).toBe("lombardia:colico");
      expect(obs?.windSpeedMs).toBe(7.5);
      expect(obs?.windGustMs).toBe(10.2);
      expect(obs?.windDirectionDeg).toBe(15);
      expect(obs?.temperatureC).toBe(23.4);
      expect(obs?.quality.status).toBe("valid");
    });

    it("parses Valmadrera (station 679) precipitation and temperature", () => {
      const rows: LombardiaSensorRow[] = [
        {
          idstazione: "679",
          data: "2026-08-12T09:50:00.000Z",
          nometiposensore: "Precipitazione",
          valore: "4.2",
          unitamisura: "mm",
        },
        {
          idstazione: "679",
          data: "2026-08-12T09:50:00.000Z",
          nometiposensore: "Temperatura",
          valore: "19.8",
          unitamisura: "°C",
        },
      ];

      const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:valmadrera", rows, refTime);
      expect(obs?.precipitationMm).toBe(4.2);
      expect(obs?.temperatureC).toBe(19.8);
    });
  });

  describe("MeteotrentinoAdapter", () => {
    it("parses real Meteotrentino XML web service payload for Torbole T0193", () => {
      const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<DatiStazione xmlns="http://dati.meteotrentino.it/">
  <codice>T0193</codice>
  <nome>Torbole Belvedere</nome>
  <data>2026-08-12T09:50:00</data>
  <temperatura>24.8</temperatura>
  <ventoVelocita>8.6</ventoVelocita>
  <ventoRaffica>11.4</ventoRaffica>
  <ventoDirezione>182</ventoDirezione>
  <pressione>1013.5</pressione>
  <precipitazione>0.0</precipitazione>
  <umidita>58</umidita>
</DatiStazione>`;

      const refTimeFresh = new Date("2026-08-12T07:55:00.000Z"); // 09:55 CEST (5 min after 09:50 CEST obs)
      const obs = MeteotrentinoAdapter.parseXmlPayload("meteotrentino:T0193", sampleXml, refTimeFresh);

      expect(obs).not.toBeNull();
      expect(obs?.stationId).toBe("meteotrentino:T0193");
      expect(obs?.windSpeedMs).toBe(8.6);
      expect(obs?.windGustMs).toBe(11.4);
      expect(obs?.windDirectionDeg).toBe(182);
      expect(obs?.temperatureC).toBe(24.8);
      expect(obs?.pressureHpa).toBe(1013.5);
      expect(obs?.quality.status).toBe("valid");
    });
  });

  describe("MeteoSwissAdapter", () => {
    it("parses Swiss alpine gradient observation with km/h conversion", () => {
      const record: MeteoSwissRecord = {
        station_code: "SBO",
        timestamp: "2026-08-12T09:50:00.000Z",
        fu3010z0: 45.0, // 45 km/h = 12.5 m/s
        fu3010z1: 60.0,
        dkl010z0: 350,
        tre200s0: 12.5,
        prestas0: 840.2,
      };

      const obs = MeteoSwissAdapter.parseObservation("meteoswiss:san_bernardino", record, refTime);

      expect(obs).not.toBeNull();
      expect(obs?.stationId).toBe("meteoswiss:san_bernardino");
      expect(obs?.windSpeedMs).toBe(12.5);
      expect(obs?.windDirectionDeg).toBe(350);
      expect(obs?.pressureHpa).toBe(840.2);
      expect(obs?.quality.status).toBe("valid");
    });
  });
});
