"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRegion } from "@/context/RegionContext";
import { MapPin, ChevronDown, Check } from "lucide-react";

export const RegionSelector: React.FC = () => {
  const { currentRegion, setRegionId, allRegions } = useRegion();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-surf-dark/80 hover:bg-surf-card border border-surf-border hover:border-sky-400 text-xs font-bold text-slate-200 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        aria-label="Select Region Edition"
        aria-expanded={isOpen}
      >
        <MapPin className="w-3.5 h-3.5 text-sky-400" />
        <span className="truncate max-w-[130px] sm:max-w-[180px]">
          {currentRegion.metadata.displayName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surf-card border border-surf-border shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          <div className="px-2.5 py-1.5 border-b border-surf-border/60 mb-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">
              SELECT REGION EDITION
            </span>
          </div>

          <div className="space-y-1">
            {allRegions.map((region) => {
              const isSelected = region.id === currentRegion.id;
              return (
                <button
                  key={region.id}
                  onClick={() => {
                    setRegionId(region.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                      : "text-slate-300 hover:text-white hover:bg-surf-dark"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>{region.metadata.displayName}</span>
                    <span
                      className={`text-[10px] font-normal ${
                        isSelected ? "text-sky-100" : "text-slate-400"
                      }`}
                    >
                      {region.metadata.country} ({region.spots.length} spots)
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
