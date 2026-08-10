"use client";

import React, { useState, useEffect, useMemo } from "react";
import { HourlyWind, SpotResult } from "@/types/weather";
import { SpotId } from "@/types/spot";
import { WindArrow } from "./WindArrow";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { formatTimeHHMM } from "@/lib/bestWindow";
import { getAthensTimeComponents } from "@/lib/localWind";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { X, Clock, AlertTriangle, Waves, Sun } from "lucide-react";

interface HourlyForecastProps {
  kouremenosResult: SpotResult;
  tendaResult: SpotResult;
  xerokamposResult: SpotResult;
  defaultSpotId?: SpotId | null;
}

export const HourlyForecast: React.FC<HourlyForecastProps> = ({
  kouremenosResult,
  tendaResult,
  xerokamposResult,
  defaultSpotId,
}) => {
  const [selectedSpotId, setSelectedSpotId] = useState<SpotId>(
    defaultSpotId || "kouremenos"
  );
  const [activeItem, setActiveItem] = useState<{ item: HourlyWind; isNow: boolean } | null>(null);

  // Dynamically sync default selection with best spot of the day
  useEffect(() => {
    if (defaultSpotId) {
      setSelectedSpotId(defaultSpotId);
    }
  }, [defaultSpotId]);

  const activeResult =
    selectedSpotId === "kouremenos"
      ? kouremenosResult
      : selectedSpotId === "tenda"
      ? tendaResult
      : xerokamposResult;

  const activeForecast = activeResult?.status === "ok" ? activeResult.data : null;

  // Filter display items: NOW (current conditions) followed strictly by daylight windsurfing hours (07:00 to 20:00)
  const displayItems = useMemo(() => {
    if (!activeForecast) return [];

    const nowMs = activeForecast.current?.timestamp
      ? new Date(activeForecast.current.timestamp).getTime()
      : Date.now();

    // Filter future hourly items:
    // 1. Strictly in the future (timestamp > nowMs)
    // 2. Strictly during daylight windsurfing window (sunrise to sunset, 07:00 - 20:00 Athens local time)
    const futureDaylightHours = activeForecast.hourly.filter((h) => {
      const hMs = new Date(h.timestamp).getTime();
      const isFuture = hMs > nowMs;
      const { hour } = getAthensTimeComponents(h.timestamp);
      const isDaylight =
        hour >= SCORING_CONFIG.daytime.startHour &&
        hour <= SCORING_CONFIG.daytime.endHour;

      return isFuture && isDaylight;
    });

    // Build timeline: NOW followed strictly by upcoming daylight hours
    if (activeForecast.current) {
      return [
        { item: activeForecast.current, isNow: true },
        ...futureDaylightHours.slice(0, 36).map((h) => ({ item: h, isNow: false })),
      ];
    }

    return futureDaylightHours.slice(0, 36).map((h) => ({ item: h, isNow: false }));
  }, [activeForecast]);

  const styleLabels: Record<string, string> = {
    WAVE: "WAVE",
    BUMP_AND_JUMP: "B&J",
    FLAT: "FLAT",
    CHOP: "CHOP",
  };

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
              <Sun className="w-4 h-4 text-amber-400" />
              <span>HOURLY SESSION FORECAST</span>
            </h2>
            <p className="text-xs text-slate-400">
              Daylight windsurfing hours (sunrise 07:00 to sunset 20:00)
            </p>
          </div>

          {/* 3-Spot Toggle Pill */}
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
            <button
              onClick={() => setSelectedSpotId("xerokampos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedSpotId === "xerokampos"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Xerokampos
            </button>
          </div>
        </div>

        {/* Unavailable State */}
        {activeResult?.status === "error" ? (
          <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Forecast currently unavailable for this spot.</span>
          </div>
        ) : (
          /* Horizontal Scrollable Hourly Ribbon */
          <div className="relative">
            <div className="flex items-stretch gap-2.5 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-surf-border scrollbar-track-transparent">
              {displayItems.map(({ item, isNow }) => {
                const timeLabel = isNow ? "NOW" : formatTimeHHMM(item.timestamp);
                const itemDate = new Date(item.timestamp);
                const dayLabel = isNow
                  ? ""
                  : new Intl.DateTimeFormat("en-GB", {
                      timeZone: "Europe/Athens",
                      weekday: "short",
                    }).format(itemDate);

                const isPrimeTime = item.sessionQualityScore >= 75;
                const isGoodTime = item.sessionQualityScore >= 60 && item.sessionQualityScore < 75;
                const isUnsuitable = item.eligibility === "UNSUITABLE";

                return (
                  <button
                    key={`${item.timestamp}-${isNow ? "now" : "hour"}`}
                    onClick={() => setActiveItem({ item, isNow })}
                    className={`flex-shrink-0 flex flex-col items-center justify-between p-3 w-20 rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                      isNow
                        ? "bg-gradient-to-b from-sky-500/25 via-surf-dark/90 to-surf-dark border-sky-400 ring-1 ring-sky-400/50 shadow-md shadow-sky-500/15"
                        : isUnsuitable
                        ? "bg-rose-950/20 border-rose-900/30 opacity-70 hover:border-rose-700"
                        : isPrimeTime
                        ? "bg-gradient-to-b from-sky-500/20 to-surf-dark/80 border-sky-500/50 hover:border-sky-400"
                        : isGoodTime
                        ? "bg-surf-dark/80 border-emerald-500/30 hover:border-emerald-400"
                        : "bg-surf-dark/50 border-surf-border/60 hover:border-surf-border"
                    }`}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span
                        className={`text-[11px] font-bold font-mono ${
                          isNow ? "text-sky-400 font-black tracking-wide" : "text-slate-300"
                        }`}
                      >
                        {timeLabel}
                      </span>
                      {dayLabel && (
                        <span className="text-[9px] text-slate-400 font-mono">
                          {dayLabel}
                        </span>
                      )}
                    </div>

                    <div className="my-1.5">
                      <span className="text-xl font-black font-mono text-white block">
                        {Math.round(item.localWind)}
                      </span>
                      <span className="text-[9px] text-slate-400 uppercase font-mono">
                        kt
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <WindArrow
                        rotation={item.arrowRotation}
                        directionLabel={item.directionLabel}
                        size="sm"
                      />
                      <span className="text-[10px] font-bold font-mono text-slate-300">
                        {item.directionLabel}
                      </span>
                    </div>

                    {/* Style & Score Indicator */}
                    <div className="w-full mt-2 pt-1 border-t border-surf-border/40 flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span className="text-[8px] text-cyan-400 uppercase font-semibold">
                        {styleLabels[item.waterState] || item.waterState}
                      </span>
                      <span
                        className={`font-bold ${
                          isUnsuitable
                            ? "text-rose-400"
                            : isPrimeTime
                            ? "text-cyan-400"
                            : isGoodTime
                            ? "text-emerald-400"
                            : "text-slate-400"
                        }`}
                      >
                        {item.sessionQualityScore}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hourly Detail Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl bg-surf-card border border-surf-border p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-surf-border/60 pb-3">
              <div>
                <span className="text-xs text-sky-400 uppercase font-bold">
                  {selectedSpotId.toUpperCase()}
                </span>
                <h4 className="text-lg font-black text-white font-mono">
                  {activeItem.isNow
                    ? "NOW (CURRENT CONDITIONS)"
                    : `${new Intl.DateTimeFormat("en-GB", {
                        timeZone: "Europe/Athens",
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(activeItem.item.timestamp))} ATHENS TIME`}
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
                  {Math.round(activeItem.item.localWind)} <span className="text-xs">kt</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  SESSION QUALITY
                </span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  {activeItem.item.sessionQualityScore} <span className="text-xs">/100</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  LOCAL GUSTS
                </span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {Math.round(activeItem.item.localGust)} <span className="text-xs">kt</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  RAW MODEL WIND
                </span>
                <span className="text-2xl font-black text-slate-300 font-mono">
                  {Math.round(activeItem.item.modelWind)} <span className="text-xs">kt</span>
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/40 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Spot Eligibility:</span>
                <span className="font-bold text-white font-mono">
                  {activeItem.item.eligibility}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Sailing Style:</span>
                <span className="font-bold text-cyan-300 flex items-center gap-1">
                  <Waves className="w-3.5 h-3.5" />
                  <span>{activeItem.item.waterState} (ESTIMATED)</span>
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Wind Direction:</span>
                <span className="font-bold text-white font-mono flex items-center gap-1.5">
                  <span>{activeItem.item.directionLabel}</span>
                  <span className="text-slate-400">({Math.round(activeItem.item.directionDegrees)}°)</span>
                  <WindArrow
                    rotation={activeItem.item.arrowRotation}
                    directionLabel={activeItem.item.directionLabel}
                    size="sm"
                  />
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Forecast Confidence:</span>
                <ConfidenceBadge
                  level={activeItem.item.confidenceLevel}
                  confidence={activeItem.item.confidence}
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
