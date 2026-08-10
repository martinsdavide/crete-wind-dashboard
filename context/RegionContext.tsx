"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { RegionConfig } from "@/types/region";
import { REGIONS, DEFAULT_REGION, getRegion } from "@/regions/registry";

interface RegionContextType {
  currentRegion: RegionConfig;
  setRegionId: (id: string) => void;
  allRegions: RegionConfig[];
}

const RegionContext = createContext<RegionContextType>({
  currentRegion: DEFAULT_REGION,
  setRegionId: () => {},
  allRegions: REGIONS,
});

export const RegionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [regionId, setRegionIdState] = useState<string>(DEFAULT_REGION.id);

  // Load persisted region on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("spotpilot_region");
      if (saved && REGIONS.some((r) => r.id === saved)) {
        setRegionIdState(saved);
      }
    } catch {
      // Ignore localStorage errors in SSR/sandboxed mode
    }
  }, []);

  const setRegionId = (id: string) => {
    setRegionIdState(id);
    try {
      localStorage.setItem("spotpilot_region", id);
    } catch {
      // Ignore localStorage errors
    }
  };

  const currentRegion = getRegion(regionId);

  return (
    <RegionContext.Provider
      value={{
        currentRegion,
        setRegionId,
        allRegions: REGIONS,
      }}
    >
      {children}
    </RegionContext.Provider>
  );
};

export const useRegion = (): RegionContextType => {
  return useContext(RegionContext);
};
