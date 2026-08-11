import { RegionConfig } from "@/types/region";
import { EasternCreteRegion } from "./eastern-crete";
import { MaremmaRegion } from "./maremma";
import { AltaToscanaRegion } from "./alta-toscana";

/**
 * Central Region Registry (Plugin Architecture).
 * To add a new region (e.g. Maremma, Lake Garda, Sardinia), simply create its config
 * under /regions/<region-name> and register it in this array.
 */
export const REGIONS: RegionConfig[] = [
  EasternCreteRegion,
  MaremmaRegion,
  AltaToscanaRegion,
];

export const DEFAULT_REGION: RegionConfig = EasternCreteRegion;

/**
 * Retrieves a region configuration by its unique ID with fallback to default region.
 */
export function getRegion(id?: string | null): RegionConfig {
  if (!id) return DEFAULT_REGION;
  const found = REGIONS.find((r) => r.id === id);
  return found || DEFAULT_REGION;
}

/**
 * Checks if a given region ID is valid and registered.
 */
export function isValidRegionId(id?: string | null): boolean {
  if (!id) return false;
  return REGIONS.some((r) => r.id === id);
}
