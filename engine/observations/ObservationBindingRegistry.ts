import { SpotStationBinding } from "./types";
import { COMO_LAKE_STATION_BINDINGS } from "./bindings/comoLakeBindings";
import { GARDA_LAKE_STATION_BINDINGS } from "./bindings/gardaLakeBindings";
import { MAREMMA_STATION_BINDINGS } from "./bindings/maremmaBindings";
import { EASTERN_CRETE_STATION_BINDINGS } from "./bindings/easternCreteBindings";

export class ObservationBindingRegistry {
  private static readonly REGISTRY: Record<string, Record<string, SpotStationBinding[]>> = {
    "como-lake": COMO_LAKE_STATION_BINDINGS,
    "garda-lake": GARDA_LAKE_STATION_BINDINGS,
    "maremma": MAREMMA_STATION_BINDINGS,
    "eastern-crete": EASTERN_CRETE_STATION_BINDINGS,
  };

  /**
   * Retrieves the station bindings mapped by spotId for a given region.
   * Returns null if no bindings are configured for the region.
   */
  static getBindingsForRegion(regionId: string): Record<string, SpotStationBinding[]> | null {
    return this.REGISTRY[regionId] || null;
  }
}
