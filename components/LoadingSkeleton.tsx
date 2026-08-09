import React from "react";
import { SpotPilotLogo } from "./SpotPilotLogo";

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="w-full space-y-6 animate-pulse" aria-label="Loading SpotPilot forecast...">
      {/* Brand Loading Splash Indicator */}
      <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
        <SpotPilotLogo variant="mark" size="large" alt="" />
        <span className="text-sm font-black text-white tracking-tight block">
          SpotPilot
        </span>
        <span className="text-xs text-sky-400 font-medium animate-pulse">
          Loading calibrated forecast...
        </span>
      </div>

      {/* Best Spot Hero Skeleton */}
      <div className="h-44 rounded-2xl bg-surf-card/80 border border-surf-border/60 p-6 flex flex-col justify-between">
        <div className="flex justify-between items-center">
          <div className="h-4 w-32 bg-slate-700/60 rounded" />
          <div className="h-6 w-24 bg-slate-700/60 rounded-full" />
        </div>
        <div className="h-8 w-48 bg-slate-700/60 rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-10 bg-surf-dark/60 rounded-xl" />
          <div className="h-10 bg-surf-dark/60 rounded-xl" />
        </div>
      </div>

      {/* Spot Cards Skeleton (3 spots) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 rounded-2xl bg-surf-card/80 border border-surf-border/60 p-6 flex flex-col justify-between"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="h-3 w-16 bg-slate-700/60 rounded" />
                <div className="h-6 w-36 bg-slate-700/60 rounded" />
              </div>
              <div className="h-5 w-24 bg-slate-700/60 rounded-full" />
            </div>
            <div className="flex justify-between items-center py-4">
              <div className="h-14 w-28 bg-slate-700/60 rounded" />
              <div className="h-12 w-12 bg-slate-700/60 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="h-10 bg-surf-dark/60 rounded-lg" />
              <div className="h-10 bg-surf-dark/60 rounded-lg" />
              <div className="h-10 bg-surf-dark/60 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Hourly Ribbon Skeleton */}
      <div className="h-36 rounded-2xl bg-surf-card/80 border border-surf-border/60 p-5" />

      {/* Chart Skeleton */}
      <div className="h-60 rounded-2xl bg-surf-card/80 border border-surf-border/60 p-5" />
    </div>
  );
};
