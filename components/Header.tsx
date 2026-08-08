"use client";

import React from "react";
import { Wind, RefreshCw } from "lucide-react";

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
    <header className="sticky top-0 z-30 w-full bg-surf-dark/80 backdrop-blur-md border-b border-surf-border/80 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 p-0.5 shadow-lg shadow-sky-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-surf-dark rounded-[10px] flex items-center justify-center">
              <Wind className="w-5 h-5 text-sky-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
              <span>CRETE WIND</span>
              <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase">
                MVP
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Palekastro & Cape Sidero
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {formattedTime && (
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-[11px] text-slate-400">Athens Time</span>
              <span className="text-xs font-mono font-semibold text-slate-200">
                {formattedTime}
              </span>
            </div>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-surf-card hover:bg-surf-cardHover border border-surf-border text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50"
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
