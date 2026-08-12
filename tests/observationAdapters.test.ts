import { describe, it, expect } from "vitest";
import { LombardiaOpenDataAdapter, LombardiaSensorRow } from "@/engine/observations/providers/LombardiaOpenDataAdapter";
import { MeteotrentinoAdapter, MeteotrentinoRawPayload } from "@/engine/observations/providers/MeteotrentinoAdapter";
import { MeteoSwissAdapter, MeteoSwissRecord } from "@/engine/observations/providers/MeteoSwissAdapter";

describe("Observation Adapters Contract Tests", () => {
  const refTime = new Date("2026-08-12T10:00:00.000Z");

  describe("LombardiaOpenDataAdapter", () => {
    it("parses valid multi-sensor Socrata payload for Colico", () => {
      const rows: LombardiaSensorRow[] = [
        {
          idstazione: "593",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Velocità Vento",
          valore: "7.5",
          unitamisura: "m/s",
        },
        {
          idstazione: "593",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Raffica Vento",
          valore: "10.2",
          unitamisura: "m/s",
        },
        {
          idstazione: "593",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Direzione Vento",
          valore: "15",
          unitamisura: "Gradi",
        },
        {
          idstazione: "593",
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

    it("converts km/h wind speed to m/s", () => {
      const rows: LombardiaSensorRow[] = [
        {
          idstazione: "593",
          data: "2026-08-12T09:55:00.000Z",
          nometiposensore: "Velocità Vento",
          valore: "36.0",
          unitamisura: "km/h",
        },
      ];

      const obs = LombardiaOpenDataAdapter.parseObservations("lombardia:colico", rows, refTime);
      expect(obs?.windSpeedMs).toBe(10.0);
    });
  });

  describe("MeteotrentinoAdapter", () => {
    it("parses Torbole T0193 payload into canonical observation", () => {
      const raw: MeteotrentinoRawPayload = {
        codiceStazione: "T0193",
        nomeStazione: "Torbole Belvedere",
        dataOra: "2026-08-12T09:52:00.000Z",
        ventoVelocita: 8.4,
        ventoRaffica: 11.2,
        ventoDirezione: 185,
        temperatura: 25.1,
        pressione: 1012.3,
        precipitazione: 0.0,
      };

      const obs = MeteotrentinoAdapter.parseObservation("meteotrentino:T0193", raw, refTime);

      expect(obs).not.toBeNull();
      expect(obs?.stationId).toBe("meteotrentino:T0193");
      expect(obs?.windSpeedMs).toBe(8.4);
      expect(obs?.windGustMs).toBe(11.2);
      expect(obs?.windDirectionDeg).toBe(185);
      expect(obs?.temperatureC).toBe(25.1);
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
