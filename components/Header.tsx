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
    <header className="sticky top-0 z-30 w-full bg-surf-dark/90 backdrop-blur-md border-b border-surf-border/80 px-4 py-2.5 md:px-8 md:py-5 lg:py-6 transition-all">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Brand Identity with Responsive Official Logo Mark (Doubled on PC) */}
        <div className="flex items-center space-x-3 md:space-x-5">
          <div className="flex-shrink-0 flex items-center justify-center">
            <SpotPilotLogo variant="mark" size="responsive-header" alt="SpotPilot" />
          </div>

          <div>
            <div className="flex items-center gap-2 md:gap-3">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black tracking-tight text-white flex items-center">
                <span>SpotPilot</span>
              </h1>
              <span className="text-[10px] md:text-xs font-extrabold tracking-wider px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 uppercase hidden sm:inline-block">
                Eastern Crete
              </span>
            </div>
            <p className="text-[11px] sm:text-xs md:text-sm lg:text-base text-slate-400 font-medium leading-tight mt-0.5">
              Find your best windsurf session
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          {formattedTime && (
            <div className="hidden md:flex flex-col items-end text-right mr-1">
              <span className="text-[10px] md:text-xs text-slate-400 font-medium">Athens Time</span>
              <span className="text-xs md:text-sm font-mono font-bold text-slate-200">
                {formattedTime}
              </span>
            </div>
          )}

          {/* Theme Selector Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 flex items-center gap-1.5 md:gap-2 shadow-sm"
            title={theme === "dark" ? "Switch to Aegean Daylight Theme (Less Dark)" : "Switch to Deep Surf Theme (Dark)"}
            aria-label="Toggle theme mode"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                <span className="text-[11px] md:text-xs font-bold text-slate-300 hidden sm:inline">
                  Daylight
                </span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 md:w-5 md:h-5 text-sky-400" />
                <span className="text-[11px] md:text-xs font-bold text-slate-700 hidden sm:inline">
                  Deep Surf
                </span>
              </>
            )}
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50 shadow-sm"
              title="Refresh Forecast"
              aria-label="Refresh forecast"
            >
              <RefreshCw
                className={`w-4 h-4 md:w-5 md:h-5 text-sky-400 ${
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
