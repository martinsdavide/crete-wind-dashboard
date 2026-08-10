"use client";

import React from "react";
import { RefreshCw, Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useRegion } from "@/context/RegionContext";
import { SpotPilotLogo } from "./SpotPilotLogo";
import { RegionSelector } from "./RegionSelector";

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  generatedAt?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  isRefreshing = false,
  generatedAt,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { currentRegion } = useRegion();

  const formattedTime = generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: currentRegion.timezone || "Europe/Athens",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(generatedAt))
    : null;

  return (
    <header className="sticky top-0 z-30 w-full bg-surf-dark/90 backdrop-blur-md border-b border-surf-border/80 px-4 py-2.5 md:px-8 md:py-4 lg:py-5 transition-all">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Identity with Responsive Official Logo Mark */}
        <div className="flex items-center space-x-3 md:space-x-5">
          <div className="flex-shrink-0 flex items-center justify-center">
            <SpotPilotLogo variant="mark" size="responsive-header" alt="SpotPilot" />
          </div>

          <div>
            <div className="flex items-center gap-2 md:gap-3">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black tracking-tight flex items-center">
                <span className="text-white">Spot</span>
                <span className="text-cyan-400 [data-theme='daylight']_:text-sky-600 ml-0.5">
                  Pilot
                </span>
              </h1>
            </div>
            <p className="text-[11px] sm:text-xs md:text-sm lg:text-base text-slate-400 font-medium leading-tight mt-0.5">
              Find your best windsurf session • {currentRegion.metadata.editionTitle}
            </p>
          </div>
        </div>

        {/* Header Controls: Region Selector positioned ABOVE the action group */}
        <div className="flex flex-col items-end gap-1.5 sm:gap-2">
          {/* 1. Region Selector (Above) */}
          <RegionSelector />

          {/* 2. Action Controls Group (Local Time, Day/Night Style Toggle, Reload) */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
            {formattedTime && (
              <div className="hidden md:flex flex-col items-end text-right mr-0.5">
                <span className="text-[9px] text-slate-400 font-medium">Local Time</span>
                <span className="text-[11px] font-mono font-bold text-slate-200">
                  {formattedTime}
                </span>
              </div>
            )}

            {/* Day/Night Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 sm:p-2 rounded-xl bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
              title={theme === "dark" ? "Switch to Aegean Daylight Theme (Less Dark)" : "Switch to Deep Surf Theme (Dark)"}
              aria-label="Toggle theme mode"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  <span className="text-[10px] sm:text-xs font-bold text-slate-300 hidden sm:inline">
                    Daylight
                  </span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
                  <span className="text-[10px] sm:text-xs font-bold text-slate-700 hidden sm:inline">
                    Deep Surf
                  </span>
                </>
              )}
            </button>

            {/* Reload Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1.5 sm:p-2 rounded-xl bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                title="Refresh Forecast"
                aria-label="Refresh forecast"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 ${
                    isRefreshing ? "animate-spin" : ""
                  }`}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
