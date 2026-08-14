"use client";

import React, { useState } from "react";
import { SpotResult } from "@/types/weather";
import { WindArrow } from "./WindArrow";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ChevronDown, ChevronUp, AlertTriangle, Waves, Radio } from "lucide-react";

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

  const eligibilityBadges: Record<string, { className: string; label: string }> = {
    IDEAL: {
      className: "badge-ideal bg-emerald-950/80 text-emerald-200 border-emerald-400/60",
      label: "IDEAL CONDITIONS",
    },
    SUITABLE: {
      className: "badge-suitable bg-sky-950/80 text-sky-200 border-sky-400/60",
      label: "SUITABLE",
    },
    MARGINAL: {
      className: "badge-marginal bg-amber-950/80 text-amber-200 border-amber-400/60",
      label: "MARGINAL",
    },
    UNSUITABLE: {
      className: "badge-unsuitable bg-rose-950/80 text-rose-200 border-rose-400/60",
      label: "UNSUITABLE",
    },
  };

  const elig = eligibilityBadges[current.eligibility] || eligibilityBadges.MARGINAL;

  const styleLabels: Record<string, string> = {
    WAVE: "WAVE / RAMPS",
    BUMP_AND_JUMP: "BUMP & JUMP",
    FLAT: "FLAT WATER",
    CHOP: "CHOPPY",
  };

  const isUnsuitable = current.eligibility === "UNSUITABLE";

  const isStationFused =
    !!forecast.observationFusion &&
    (forecast.observationFusion.status === "available" || forecast.observationFusion.status === "partial") &&
    (forecast.observationFusion.contributors?.length ?? 0) > 0;

  return (
    <div
      className={`w-full rounded-2xl bg-surf-card border ${
        isUnsuitable ? "border-rose-950/60 opacity-80" : "border-surf-border hover:border-surf-border/80"
      } shadow-lg p-5 sm:p-6 transition-all`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
              NOW
            </span>
            {isStationFused && (
              <span
                title={`Data fused from weather station: ${forecast.observationFusion?.contributors?.map((c) => c.stationName).join(", ")}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shadow-sm"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Radio className="w-3 h-3 text-emerald-400" />
                <span>LIVE STATION</span>
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mt-1">
            {spot.name}
          </h3>
          <p className="text-xs text-slate-400">{spot.subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`text-[10px] font-extrabold tracking-wider px-2.5 py-0.5 rounded-full border shadow-sm ${elig.className}`}
          >
            {elig.label}
          </span>
          <ConfidenceBadge
            level={current.confidenceLevel}
            confidence={current.confidence}
          />
        </div>
      </div>

      {/* Live Station Callout Banner */}
      {isStationFused && forecast.observationFusion && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-200 shadow-sm">
          <div className="flex items-center gap-2 overflow-hidden">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse flex-shrink-0" />
            <div className="truncate text-[11px]">
              <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[10px] mr-1">
                LIVE OBS:
              </span>
              <span className="font-semibold text-white">
                {forecast.observationFusion.contributors.map((c) => c.stationName).join(", ")}
              </span>
              {forecast.observationFusion.contributors[0]?.observedAt && (
                <span className="text-emerald-400/80 text-[10px] ml-1">
                  ({Math.max(0, Math.round((Date.now() - new Date(forecast.observationFusion.contributors[0].observedAt).getTime()) / 60000))}m ago)
                </span>
              )}
            </div>
          </div>
          {forecast.observationFusion.contributors[0]?.observedWindKt !== null && forecast.observationFusion.contributors[0]?.observedWindKt !== undefined && (
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-900/60 border border-emerald-500/30 px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-bold">
              {Math.round(forecast.observationFusion.contributors[0].observedWindKt)} kt station
            </span>
          )}
        </div>
      )}

      {/* Main Wind Speed & Direction Display */}
      <div className="flex items-center justify-between py-3 border-y border-surf-border/60">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl sm:text-6xl font-black tracking-tight text-white font-mono">
            {Math.round(current.localWind)}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sky-400">KNOTS</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              SPOT WIND
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
            SESSION SCORE
          </span>
          <span
            className={`text-base font-extrabold font-mono ${
              isUnsuitable ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {Math.round(current.sessionQualityScore)}{" "}
            <span className="text-xs font-normal text-slate-400">/100</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-surf-dark/60 border border-surf-border/40 text-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
            RAW MODEL
          </span>
          <span className="text-base font-extrabold font-mono text-slate-300">
            {Math.round(current.modelWind)} <span className="text-xs font-normal">kt</span>
          </span>
        </div>
      </div>

      {/* Style & Details Toggle */}
      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge-style inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-sky-950/80 text-sky-200 border border-sky-400/60 shadow-sm">
            <Waves className="w-3.5 h-3.5 text-sky-400" />
            <span>{styleLabels[current.waterState] || current.waterState}</span>
          </span>
          {current.seaState && current.seaState.waveHeight !== null && (
            current.seaState.source === "MARINE_FORECAST" ? (
              <span
                title="ECMWF WAM wave model"
                className="text-[11px] font-mono text-slate-200 bg-surf-dark/80 border border-sky-500/40 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm"
              >
                <span>🌊</span>
                <span className="font-bold text-sky-200">{current.seaState.waveHeight.toFixed(1)}m</span>
                {current.seaState.wavePeriod !== null && (
                  <span className="text-slate-400">• {Math.round(current.seaState.wavePeriod)}s</span>
                )}
              </span>
            ) : (
              <span
                title="Estimated from local wind speed (marine model unavailable)"
                className="text-[10px] font-mono text-slate-400/80 bg-surf-dark/30 border border-surf-border/30 px-1.5 py-0.5 rounded-md flex items-center gap-1 italic"
              >
                <span>🌊</span>
                <span>~{current.seaState.waveHeight.toFixed(1)}m</span>
                <span className="text-[9px] text-slate-400 font-sans not-italic">(est. from wind)</span>
              </span>
            )
          )}
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition-colors"
        >
          <span>{showDetails ? "Hide Diagnostic" : "View Diagnostic"}</span>
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expandable Diagnostic Breakdown */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-surf-border/40 text-xs space-y-2">
          <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
            <div>Spot Wind Quality: <strong className="text-white">{Math.round(current.spotWindQuality)}/100</strong></div>
            <div>Direction Score: <strong className="text-white">{Math.round(current.directionQuality)}/100</strong></div>
            <div>Sea Quality Score: <strong className="text-white">{Math.round(current.seaState?.seaQualityScore ?? current.waterStateQuality ?? 60)}/100</strong></div>
            <div>Rider Preference: <strong className="text-white">{Math.round(current.preferenceScore)}/100</strong></div>
            <div>Correction Factor: <strong className="text-white">x{current.correctionFactor.toFixed(2)}</strong></div>
            <div>Marine Source: <strong className="text-white">{current.seaState?.source || "WIND_DERIVED"}</strong></div>
          </div>
          {current.seaState && current.seaState.source === "MARINE_FORECAST" && (
            <div className="grid grid-cols-3 gap-1.5 pt-2 text-[10px] text-slate-400 font-mono bg-surf-dark/40 p-2 rounded-lg border border-surf-border/30">
              <div>Exposure: <strong className="text-sky-300">{current.seaState.exposureScore}%</strong></div>
              <div>Alignment: <strong className="text-sky-300">{current.seaState.alignmentScore}%</strong></div>
              <div>Organization: <strong className="text-sky-300">{current.seaState.organizationScore}%</strong></div>
            </div>
          )}
          {isStationFused && forecast.observationFusion && (
            <div className="pt-2 text-[10px] text-emerald-200 font-mono bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-500/25 space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-300">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-400" /> Weather Station Fusion
                </span>
                <span className="bg-emerald-900/60 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">
                  {forecast.observationFusion.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-slate-300 pt-0.5">
                <div>Speed Bias: <strong className="text-emerald-300">{forecast.observationFusion.speedCorrectionKt > 0 ? `+${forecast.observationFusion.speedCorrectionKt.toFixed(1)}` : forecast.observationFusion.speedCorrectionKt.toFixed(1)} kt</strong></div>
                <div>Confidence Adj: <strong className="text-emerald-300">{forecast.observationFusion.confidenceAdjustment >= 0 ? `+${Math.round(forecast.observationFusion.confidenceAdjustment * 100)}%` : `${Math.round(forecast.observationFusion.confidenceAdjustment * 100)}%`}</strong></div>
                {forecast.observationFusion.directionCorrectionDeg !== null && (
                  <div>Direction Correction: <strong className="text-emerald-300">{forecast.observationFusion.directionCorrectionDeg > 0 ? `+${forecast.observationFusion.directionCorrectionDeg}°` : `${forecast.observationFusion.directionCorrectionDeg}°`}</strong></div>
                )}
                <div>Coverage Quality: <strong className="text-emerald-300">{Math.round(forecast.observationFusion.observationCoverage * 100)}%</strong></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
