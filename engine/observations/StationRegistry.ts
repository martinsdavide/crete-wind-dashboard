import { WeatherStation } from "./types";

export const WEATHER_STATIONS: Record<string, WeatherStation> = {
  // --- Lake Como Stations ---
  "lombardia:colico": {
    id: "lombardia:colico",
    provider: "Regione Lombardia / ARPA Lombardia",
    providerStationId: "573",
    name: "Colico – v. La Madoneta",
    latitude: 46.136,
    longitude: 9.371,
    elevationM: 210,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["spot-local", "lake-upwind"],
    capabilities: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
    attribution: "Dati meteorologici forniti da Regione Lombardia / ARPA Lombardia Open Data (CC-BY 4.0)",
    sourceUrl: "https://dati.lombardia.it/resource/647i-nhxk.json",
  },
  "lombardia:valmadrera": {
    id: "lombardia:valmadrera",
    provider: "Regione Lombardia / ARPA Lombardia",
    providerStationId: "679",
    name: "Valmadrera – v. Pozzi",
    latitude: 45.845,
    longitude: 9.360,
    elevationM: 235,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["spot-local", "valley", "precipitation-context"],
    capabilities: ["temperature", "precipitation", "humidity"],
    attribution: "Dati meteorologici forniti da Regione Lombardia / ARPA Lombardia Open Data (CC-BY 4.0)",
    sourceUrl: "https://dati.lombardia.it/resource/647i-nhxk.json",
  },
  "meteoswiss:san_bernardino": {
    id: "meteoswiss:san_bernardino",
    provider: "MeteoSwiss",
    providerStationId: "SBO",
    name: "San Bernardino Pass",
    latitude: 46.498,
    longitude: 9.193,
    elevationM: 1639,
    timezone: "Europe/Zurich",
    status: "active",
    roles: ["gradient", "mountain"],
    capabilities: ["pressure", "temperature", "wind_speed", "wind_direction"],
    attribution: "Federal Office of Meteorology and Climatology MeteoSwiss",
    sourceUrl: "https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/",
  },

  // --- Lake Garda Stations ---
  "meteotrentino:T0193": {
    id: "meteotrentino:T0193",
    provider: "Meteotrentino",
    providerStationId: "T0193",
    name: "Torbole Belvedere",
    latitude: 45.872,
    longitude: 10.878,
    elevationM: 80,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["spot-local", "lake-upwind", "gradient"],
    capabilities: [
      "wind_speed",
      "wind_direction",
      "wind_gust",
      "temperature",
      "pressure",
      "precipitation",
      "solar_radiation",
    ],
    attribution: "Dati forniti dal Servizio Meteotrentino della Provincia Autonoma di Trento",
    sourceUrl: "https://www.meteotrentino.it/",
  },
  "meteotrentino:T0401": {
    id: "meteotrentino:T0401",
    provider: "Meteotrentino",
    providerStationId: "T0401",
    name: "Arco Bruttagosto",
    latitude: 45.918,
    longitude: 10.887,
    elevationM: 95,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["valley", "precipitation-context"],
    capabilities: ["temperature", "precipitation", "humidity"],
    attribution: "Dati forniti dal Servizio Meteotrentino della Provincia Autonoma di Trento",
    sourceUrl: "https://www.meteotrentino.it/",
  },
  "meteotrentino:T0354": {
    id: "meteotrentino:T0354",
    provider: "Meteotrentino",
    providerStationId: "T0354",
    name: "Tremalzo",
    latitude: 45.837,
    longitude: 10.697,
    elevationM: 1650,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["mountain", "lake-upwind"],
    capabilities: ["wind_speed", "wind_direction", "temperature", "pressure", "precipitation"],
    attribution: "Dati forniti dal Servizio Meteotrentino della Provincia Autonoma di Trento",
    sourceUrl: "https://www.meteotrentino.it/",
  },
  "siar:marina_grosseto": {
    id: "siar:marina_grosseto",
    provider: "SIR Toscana / Settore Idrologico Regionale",
    providerStationId: "TOS01_Grosseto",
    name: "Marina di Grosseto – Port",
    latitude: 42.718,
    longitude: 10.985,
    elevationM: 2,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["spot-local", "lake-upwind"],
    capabilities: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
    attribution: "Dati meteorologici forniti da SIR Toscana Open Data",
    sourceUrl: "http://www.sir.toscana.it/",
  },
  "siar:talamone_sentinel": {
    id: "siar:talamone_sentinel",
    provider: "SIR Toscana / Settore Idrologico Regionale",
    providerStationId: "TOS02_Talamone",
    name: "Talamone – Wind Sentinel",
    latitude: 42.555,
    longitude: 11.132,
    elevationM: 10,
    timezone: "Europe/Rome",
    status: "active",
    roles: ["spot-local", "lake-upwind"],
    capabilities: ["wind_speed", "wind_direction", "wind_gust", "temperature", "precipitation"],
    attribution: "Dati meteorologici forniti da SIR Toscana Open Data",
    sourceUrl: "http://www.sir.toscana.it/",
  },
};

export class StationRegistry {
  static getStation(id: string): WeatherStation | null {
    return WEATHER_STATIONS[id] || null;
  }

  static getAllStations(): WeatherStation[] {
    return Object.values(WEATHER_STATIONS);
  }

  static getStationsForRegion(regionId: string): WeatherStation[] {
    if (regionId === "como-lake") {
      return Object.values(WEATHER_STATIONS).filter((s) => s.id.startsWith("lombardia:") || s.id.startsWith("meteoswiss:"));
    }
    if (regionId === "garda-lake") {
      return Object.values(WEATHER_STATIONS).filter((s) => s.id.startsWith("meteotrentino:"));
    }
    if (regionId === "maremma") {
      return Object.values(WEATHER_STATIONS).filter((s) => s.id.startsWith("siar:"));
    }
    return [];
  }
}
