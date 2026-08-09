"use client";

import React, { useState } from "react";
import { SpotResult } from "@/types/weather";
import { WindArrow } from "./WindArrow";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

interface SpotCardProps {
  result: SpotResult;
}

export const SpotCard: React.FC<SpotCardProps> = ({ result }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (result.status === "error") {
    return (
      <div className="w-full rounded-2xl bg-surf-card border border-surf-border p-5 sm:p-6 shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              UNAVAILABLE
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mt-1">
              {result.spot.name}
            </h3>
            <p className="text-xs text-slate-400">{result.spot.subtitle}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surf-dark/60 border border-surf-border/40 text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
          <p className="text-xs text-slate-300">
            Spot forecast temporarily unavailable from weather provider.
          </p>
          <span className="text-[10px] text-slate-500">{result.message}</span>
        </div>
      </div>
    );
  }

  const forecast = result.data;
  const { spot, current } = forecast;

  const classificationColors: Record<string, { bg: string; text: string; border: string }> = {
    LOW: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
    LIGHT: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30" },
    GOOD: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    GREAT: { bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30" },
    STRONG: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
    "VERY STRONG": { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
  };

  const classStyle =
    classificationColors[current.classification] || classificationColors.LOW;

  return (
    <div className="w-full rounded-2xl bg-surf-card border border-surf-border hover:border-surf-border/80 shadow-lg p-5 sm:p-6 transition-all">
      {/* Card Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
            NOW
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mt-1">
            {spot.name}
          </h3>
          <p className="text-xs text-slate-400">{spot.subtitle}</p>
        </div>

        <ConfidenceBadge
          level={current.confidenceLevel}
          confidence={current.confidence}
        />
      </div>

      {/* Main Wind Speed & Direction Display */}
      <div className="flex items-center justify-between py-3 border-y border-surf-border/60">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl sm:text-6xl font-black tracking-tight text-white font-mono">
            {Math.round(current.localWind)}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sky-400">KNOTS</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              LOCAL EST.
            </span>
          </div>
        </div>

        {/* Direction & Arrow */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-2xl font-black text-white font-mono block">
              {current.directionLabel}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {Math.round(current.directionDegrees)}°
            </span>
          </div>
          <WindArrow
            rotation={current.arrowRotation}
            directionLabel={current.directionLabel}
            size="lg"
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 py-3">
        <div className="p-2.5 rounded-xl bg-surf-dark/60 border border-surf-border/40 text-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
            GUSTS
          </span>
          <span className="text-base font-extrabold font-mono text-amber-400">
            {Math.round(current.localGust)} <span className="text-xs font-normal">kt</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-surf-dark/60 border border-surf-border/40 text-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
            MODEL
          </span>
          <span className="text-base font-extrabold font-mono text-slate-300">
            {Math.round(current.modelWind)} <span className="text-xs font-normal">kt</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-surf-dark/60 border border-surf-border/40 text-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
            LOCAL
          </span>
          <span className="text-base font-extrabold font-mono text-cyan-300">
            {Math.round(current.localWind)} <span className="text-xs font-normal">kt</span>
          </span>
        </div>
      </div>

      {/* Wind Classification & Score Banner */}
      <div className="flex items-center justify-between pt-1">
        <span
          className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${classStyle.bg} ${classStyle.text} ${classStyle.border}`}
        >
          {current.classification}
        </span>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-surf-cardHover"
          aria-expanded={showDetails}
        >
          <span>{showDetails ? "Less" : "Correction Details"}</span>
          {showDetails ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Expandable Model Correction Details */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-surf-border/60 text-xs text-slate-300 space-y-1.5 bg-surf-dark/40 p-3 rounded-xl">
          <div className="flex justify-between">
            <span className="text-slate-400">Correction Factor:</span>
            <span className="font-mono font-bold text-sky-400">
              x{current.correctionFactor.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Hourly Surf Score:</span>
            <span className="font-mono font-bold text-white">
              {current.score}/100 ({current.condition})
            </span>
          </div>
          {current.temperature !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Air Temp / Cloud:</span>
              <span className="font-mono text-slate-200">
                {Math.round(current.temperature)}°C • {Math.round(current.cloudCover ?? 0)}%
              </span>
            </div>
          )}
          <p className="text-[10px] text-slate-500 pt-1">
            Empirical spot model adjusted for direction, thermal profile, and orography.
          </p>
        </div>
      )}
    </div>
  );
};
