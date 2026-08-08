"use client";

import React, { useState } from "react";
import { HourlyWind, SpotForecast } from "@/types/weather";
import { WindArrow } from "./WindArrow";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { formatTimeHHMM } from "@/lib/bestWindow";
import { X, Clock, Wind, Gauge, Compass, Activity } from "lucide-react";

interface HourlyForecastProps {
  kouremenosForecast: SpotForecast;
  tendaForecast: SpotForecast;
}

export const HourlyForecast: React.FC<HourlyForecastProps> = ({
  kouremenosForecast,
  tendaForecast,
}) => {
  const [selectedSpotId, setSelectedSpotId] = useState<"kouremenos" | "tenda">("kouremenos");
  const [activeItem, setActiveItem] = useState<HourlyWind | null>(null);

  const activeForecast =
    selectedSpotId === "kouremenos" ? kouremenosForecast : tendaForecast;

  // Show up to the next 24-36 hourly points for the active day/horizon
  const displayItems = activeForecast.hourly.slice(0, 36);

  return (
    <section aria-labelledby="hourly-forecast-heading" className="w-full">
      <div className="rounded-2xl bg-surf-card border border-surf-border p-5 shadow-lg">
        {/* Header & Spot Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2
              id="hourly-forecast-heading"
              className="text-base font-extrabold uppercase tracking-tight text-white flex items-center gap-2"
            >
              <Clock className="w-4 h-4 text-sky-400" />
              <span>HOURLY FORECAST</span>
            </h2>
            <p className="text-xs text-slate-400">
              Tap any hour to inspect detailed model vs local metrics
            </p>
          </div>

          {/* Spot Toggle Pill */}
          <div className="inline-flex p-1 rounded-xl bg-surf-dark border border-surf-border self-start sm:self-auto">
            <button
              onClick={() => setSelectedSpotId("kouremenos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedSpotId === "kouremenos"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Kouremenos
            </button>
            <button
              onClick={() => setSelectedSpotId("tenda")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedSpotId === "tenda"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tenda
            </button>
          </div>
        </div>

        {/* Horizontal Scrollable Hourly Ribbon */}
        <div className="relative">
          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-surf-border scrollbar-track-transparent">
            {displayItems.map((item, index) => {
              const timeLabel = index === 0 ? "NOW" : formatTimeHHMM(item.timestamp);
              const isPrimeTime = item.score >= 75;
              const isGoodTime = item.score >= 60 && item.score < 75;

              return (
                <button
                  key={item.timestamp}
                  onClick={() => setActiveItem(item)}
                  className={`flex-shrink-0 flex flex-col items-center justify-between p-3 w-20 rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                    isPrimeTime
                      ? "bg-gradient-to-b from-sky-500/20 to-surf-dark/80 border-sky-500/50 hover:border-sky-400"
                      : isGoodTime
                      ? "bg-surf-dark/80 border-emerald-500/30 hover:border-emerald-400"
                      : "bg-surf-dark/50 border-surf-border/60 hover:border-surf-border"
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold font-mono ${
                      index === 0 ? "text-sky-400 font-extrabold" : "text-slate-400"
                    }`}
                  >
                    {timeLabel}
                  </span>

                  <div className="my-2">
                    <span className="text-xl font-black font-mono text-white block">
                      {Math.round(item.localWind)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">
                      kt
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <WindArrow
                      rotation={item.arrowRotation}
                      directionLabel={item.directionLabel}
                      size="sm"
                    />
                    <span className="text-[11px] font-bold font-mono text-slate-300">
                      {item.directionLabel}
                    </span>
                  </div>

                  {/* Tiny Score Bar Indicator */}
                  <div className="w-full mt-2 pt-1 border-t border-surf-border/40 flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span>G:{Math.round(item.localGust)}</span>
                    <span
                      className={`font-bold ${
                        isPrimeTime
                          ? "text-cyan-400"
                          : isGoodTime
                          ? "text-emerald-400"
                          : "text-slate-400"
                      }`}
                    >
                      {item.score}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hourly Detail Modal / Popover */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl bg-surf-card border border-surf-border p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-surf-border/60 pb-3">
              <div>
                <span className="text-xs text-sky-400 uppercase font-bold">
                  {selectedSpotId === "kouremenos" ? "Kouremenos" : "Tenda"}
                </span>
                <h4 className="text-lg font-black text-white font-mono">
                  {formatTimeHHMM(activeItem.timestamp)} ATHENS TIME
                </h4>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="p-1.5 rounded-lg bg-surf-dark hover:bg-surf-cardHover border border-surf-border text-slate-400 hover:text-white"
                aria-label="Close details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  LOCAL ESTIMATE
                </span>
                <span className="text-2xl font-black text-cyan-400 font-mono">
                  {Math.round(activeItem.localWind)} <span className="text-xs">kt</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  RAW MODEL WIND
                </span>
                <span className="text-2xl font-black text-slate-300 font-mono">
                  {Math.round(activeItem.modelWind)} <span className="text-xs">kt</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  LOCAL GUSTS
                </span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {Math.round(activeItem.localGust)} <span className="text-xs">kt</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  WINDSURF SCORE
                </span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  {activeItem.score} <span className="text-xs">/100</span>
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Wind Direction:</span>
                <span className="font-bold text-white font-mono flex items-center gap-1.5">
                  <span>{activeItem.directionLabel}</span>
                  <span className="text-slate-400">({Math.round(activeItem.directionDegrees)}°)</span>
                  <WindArrow
                    rotation={activeItem.arrowRotation}
                    directionLabel={activeItem.directionLabel}
                    size="sm"
                  />
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Classification:</span>
                <span className="font-bold text-sky-300">
                  {activeItem.classification} ({activeItem.condition})
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Correction Factor:</span>
                <span className="font-mono text-slate-200">
                  x{activeItem.correctionFactor.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Forecast Confidence:</span>
                <ConfidenceBadge
                  level={activeItem.confidenceLevel}
                  confidence={activeItem.confidence}
                  showPercent
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
