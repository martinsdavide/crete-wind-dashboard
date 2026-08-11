import { MarineForecast } from "@/types/marine";

/**
 * Generic abstraction for marine / wave forecast providers.
 * Allows seamless switching between wave models (e.g. Open-Meteo ECMWF WAM, Copernicus Marine, etc.)
 */
export interface MarineForecastProvider {
  fetchMarineForecast(
    latitude: number,
    longitude: number,
    forecastDays?: number
  ): Promise<MarineForecast | null>;
}
