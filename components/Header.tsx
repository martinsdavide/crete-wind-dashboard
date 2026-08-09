"use client";

import React from "react";
import { RefreshCw, Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { SpotPilotLogo } from "./SpotPilotLogo";

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

  const formattedTime = generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Athens",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(generatedAt))
    : null;

  return (
    <header className="sticky top-0 z-30 w-full bg-surf-dark/85 backdrop-blur-md border-b border-surf-border/80 px-4 py-2.5">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Brand Identity with Official Logo Mark */}
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0 flex items-center justify-center">
            <SpotPilotLogo variant="mark" size="medium" alt="SpotPilot" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center">
                <span>SpotPilot</span>
              </h1>
              <span className="text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 uppercase hidden sm:inline-block">
                Eastern Crete
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium leading-tight">
              Find your best windsurf session
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {formattedTime && (
            <div className="hidden md:flex flex-col items-end text-right mr-1">
              <span className="text-[10px] text-slate-400 font-medium">Athens Time</span>
              <span className="text-xs font-mono font-bold text-slate-200">
                {formattedTime}
              </span>
            </div>
          )}

          {/* Theme Selector Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
            title={theme === "dark" ? "Switch to Aegean Daylight Theme (Less Dark)" : "Switch to Deep Surf Theme (Dark)"}
            aria-label="Toggle theme mode"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-bold text-slate-300 hidden md:inline">
                  Daylight
                </span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-sky-400" />
                <span className="text-[11px] font-bold text-slate-700 hidden md:inline">
                  Deep Surf
                </span>
              </>
            )}
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50 shadow-sm"
              title="Refresh Forecast"
              aria-label="Refresh forecast"
            >
              <RefreshCw
                className={`w-4 h-4 text-sky-400 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
