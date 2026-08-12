"use client";

import React, { useState, useEffect, useMemo } from "react";
import { HourlyWind, SpotResult } from "@/types/weather";
import { SpotId } from "@/types/spot";
import { WindArrow } from "./WindArrow";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { formatTimeHHMM } from "@/lib/bestWindow";
import { isSpotOperatingHour } from "@/lib/solar";
import { X, AlertTriangle, Waves, Sun } from "lucide-react";

interface HourlyForecastProps {
  spots?: Record<string, SpotResult>;
  spotList?: SpotResult[];
  defaultSpotId?: SpotId | string | null;
  timezone?: string;
  // Legacy optional props for backward compatibility
  kouremenosResult?: SpotResult;
  tendaResult?: SpotResult;
  xerokamposResult?: SpotResult;
}

export const HourlyForecast: React.FC<HourlyForecastProps> = ({
  spots,
  spotList,
  defaultSpotId,
  timezone = "Europe/Athens",
  kouremenosResult,
  tendaResult,
  xerokamposResult,
}) => {
  // Dynamically resolve all spots
  const allSpotResults = useMemo(() => {
    if (spotList && spotList.length > 0) return spotList.filter(Boolean);
    if (spots && Object.keys(spots).length > 0) return Object.values(spots).filter(Boolean);
    return [kouremenosResult, tendaResult, xerokamposResult].filter(Boolean) as SpotResult[];
  }, [spotList, spots, kouremenosResult, tendaResult, xerokamposResult]);

  const availableSpots = useMemo(() => {
    return allSpotResults.map((r) => {
      const id = r.status === "ok" ? r.data.spot.id : r.spot.id;
      const name = r.status === "ok" ? r.data.spot.name : r.spot.name;
      return { id, name, result: r };
    });
  }, [allSpotResults]);

  const initialSpotId = (defaultSpotId as string) || (availableSpots[0]?.id ?? "kouremenos");
  const [selectedSpotId, setSelectedSpotId] = useState<string>(initialSpotId);
  const [activeItem, setActiveItem] = useState<{ item: HourlyWind; isNow: boolean } | null>(null);

  // Dynamically sync default selection when defaultSpotId changes
  useEffect(() => {
    if (defaultSpotId) {
      setSelectedSpotId(defaultSpotId as string);
    }
  }, [defaultSpotId]);

  // If available spots change and current selection is not available in the new region, update selection
  useEffect(() => {
    if (availableSpots.length > 0) {
      setSelectedSpotId((prev) => {
        if (availableSpots.some((s) => s.id === prev)) return prev;
        return defaultSpotId ? (defaultSpotId as string) : availableSpots[0].id;
      });
    }
  }, [availableSpots, defaultSpotId]);

  const activeSpotEntry = availableSpots.find((s) => s.id === selectedSpotId) || availableSpots[0];
  const activeResult = activeSpotEntry?.result || null;
  const activeForecast = activeResult?.status === "ok" ? activeResult.data : null;

  // Filter display items: NOW (current conditions) followed strictly by daylight windsurfing hours
  const displayItems = useMemo(() => {
    if (!activeForecast) return [];

    const nowMs = activeForecast.current?.timestamp
      ? new Date(activeForecast.current.timestamp).getTime()
      : Date.now();

    const lat = activeForecast.spot?.latitude ?? 35.19;
    const lon = activeForecast.spot?.longitude ?? 26.27;

    const futureDaylightHours = activeForecast.hourly.filter((h) => {
      const hMs = new Date(h.timestamp).getTime();
      const isFuture = hMs > nowMs;
      const isOperating = isSpotOperatingHour(h.timestamp, activeForecast.spot, timezone);

      return isFuture && isOperating;
    });

    // Build timeline: NOW followed strictly by upcoming daylight hours
    if (activeForecast.current) {
      return [
        { item: activeForecast.current, isNow: true },
        ...futureDaylightHours.slice(0, 36).map((h) => ({ item: h, isNow: false })),
      ];
    }

    return futureDaylightHours.slice(0, 36).map((h) => ({ item: h, isNow: false }));
  }, [activeForecast, timezone]);

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
              Solar daylight windsurfing hours (sunrise to sunset)
            </p>
          </div>

          {/* Dynamic Spot Toggle Pill */}
          <div className="flex flex-wrap p-1 rounded-xl bg-surf-dark border border-surf-border self-start sm:self-auto gap-1">
            {availableSpots.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSpotId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedSpotId === s.id
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s.name}
              </button>
            ))}
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
                const timeLabel = isNow ? "NOW" : formatTimeHHMM(item.timestamp, timezone);
                const itemDate = new Date(item.timestamp);
                const dayLabel = isNow
                  ? ""
                  : new Intl.DateTimeFormat("en-GB", {
                      timeZone: timezone,
                      weekday: "short",
                    })
                      .format(itemDate)
                      .toUpperCase();

                const isPrimeTime = item.sessionQualityScore >= 75;
                const isGoodTime = item.sessionQualityScore >= 60 && item.sessionQualityScore < 75;
                const isUnsuitable = item.eligibility === "UNSUITABLE";

                return (
                  <button
                    key={`${item.timestamp}-${isNow ? "now" : "hour"}`}
                    onClick={() => setActiveItem({ item, isNow })}
                    className={`flex-shrink-0 flex flex-col items-center justify-between p-3 w-[86px] sm:w-[90px] rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-sky-400 ${
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
                    {/* High-Visibility Day and Time Header */}
                    <div className="w-full flex flex-col items-center gap-0.5 mb-1">
                      {isNow ? (
                        <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded bg-sky-500/25 border border-sky-400/60 text-sky-300 tracking-wider">
                          NOW
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-black uppercase tracking-wider text-sky-400 [data-theme='daylight']_:text-sky-700 block">
                            {dayLabel}
                          </span>
                          <span className="text-xs font-black font-mono text-slate-200">
                            {timeLabel}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="my-1">
                      <span className="text-2xl font-black font-mono text-white block leading-none">
                        {Math.round(item.localWind)}
                      </span>
                      <span className="text-[9px] text-slate-400 uppercase font-mono mt-0.5 block">
                        kt
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1 my-1">
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
                    <div className="w-full mt-1.5 pt-1.5 border-t border-surf-border/40 flex flex-col gap-0.5 text-[9px] font-mono text-slate-400">
                      <div className="flex items-center justify-between">
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
                      {item.seaState && item.seaState.waveHeight !== null && (
                        <div className="text-[8px] font-mono text-center truncate">
                          {item.seaState.source === "MARINE_FORECAST" ? (
                            <span className="text-slate-300">
                              🌊 {item.seaState.waveHeight.toFixed(1)}m{item.seaState.wavePeriod !== null ? ` • ${Math.round(item.seaState.wavePeriod)}s` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-400/80 italic">
                              🌊 ~{item.seaState.waveHeight.toFixed(1)}m <span className="not-italic text-[7px] text-slate-400">(est.)</span>
                            </span>
                          )}
                        </div>
                      )}
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
                  {activeSpotEntry?.name.toUpperCase() || selectedSpotId.toUpperCase()}
                </span>
                <h4 className="text-lg font-black text-white font-mono">
                  {activeItem.isNow
                    ? "NOW (CURRENT CONDITIONS)"
                    : `${new Intl.DateTimeFormat("en-GB", {
                        timeZone: timezone,
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(activeItem.item.timestamp))} LOCAL TIME`}
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
                <span className="text-slate-400">Sea State:</span>
                <span className="font-bold text-cyan-300 flex items-center gap-1">
                  <Waves className="w-3.5 h-3.5" />
                  <span>{activeItem.item.waterState}</span>
                  {activeItem.item.seaState?.source === "MARINE_FORECAST" ? (
                    <span className="text-[10px] text-sky-400 font-normal">
                      (ECMWF WAM)
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-normal italic">
                      (est. from wind)
                    </span>
                  )}
                </span>
              </div>

              {activeItem.item.seaState && activeItem.item.seaState.waveHeight !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Wave & Period:</span>
                  <span className="font-bold text-white font-mono">
                    {activeItem.item.seaState.source === "MARINE_FORECAST" ? (
                      <>
                        {activeItem.item.seaState.waveHeight.toFixed(1)}m
                        {activeItem.item.seaState.wavePeriod !== null
                          ? ` • ${activeItem.item.seaState.wavePeriod.toFixed(1)}s`
                          : ""}
                      </>
                    ) : (
                      <span className="text-slate-300 italic font-normal">
                        ~{activeItem.item.seaState.waveHeight.toFixed(1)}m <span className="text-xs text-slate-400 font-sans not-italic">(est. from wind)</span>
                      </span>
                    )}
                  </span>
                </div>
              )}

              {activeItem.item.seaState && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Sea Quality Score:</span>
                  <span className="font-bold text-sky-300 font-mono">
                    {activeItem.item.seaState.seaQualityScore}/100
                  </span>
                </div>
              )}

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
