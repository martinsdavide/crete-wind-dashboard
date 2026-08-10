"use client";

import React, { useState, useEffect, useMemo } from "react";
import { SpotResult } from "@/types/weather";
import { SpotId } from "@/types/spot";
import { WindArrow } from "./WindArrow";
import { Calendar, Clock, Wind, Flame, AlertTriangle, Waves } from "lucide-react";

interface DailyForecastProps {
  spots?: Record<string, SpotResult>;
  spotList?: SpotResult[];
  defaultSpotId?: SpotId | string | null;
  timezone?: string;
  // Legacy optional props for backward compatibility
  kouremenosResult?: SpotResult;
  tendaResult?: SpotResult;
  xerokamposResult?: SpotResult;
}

export const DailyForecast: React.FC<DailyForecastProps> = ({
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
  const [activeSpotId, setActiveSpotId] = useState<string>(initialSpotId);

  // Dynamically sync default selection with best spot of the day
  useEffect(() => {
    if (defaultSpotId) {
      setActiveSpotId(defaultSpotId as string);
    } else if (availableSpots.length > 0 && !availableSpots.some((s) => s.id === activeSpotId)) {
      setActiveSpotId(availableSpots[0].id);
    }
  }, [defaultSpotId, availableSpots, activeSpotId]);

  const activeSpotEntry = availableSpots.find((s) => s.id === activeSpotId) || availableSpots[0];
  const activeResult = activeSpotEntry?.result || null;
  const activeForecast = activeResult?.status === "ok" ? activeResult.data : null;

  const formatDateLabel = (dateStr: string, index: number) => {
    if (index === 0) return "TODAY";
    if (index === 1) return "TOMORROW";

    try {
      const date = new Date(dateStr + "T12:00:00Z");
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "short",
        day: "numeric",
        month: "short",
      })
        .format(date)
        .toUpperCase();
    } catch {
      return dateStr;
    }
  };

  const conditionBadges: Record<string, string> = {
    EXCELLENT: "badge-cond-excellent bg-cyan-950/80 text-cyan-200 border-cyan-400/60",
    "VERY GOOD": "badge-cond-verygood bg-emerald-950/80 text-emerald-200 border-emerald-400/60",
    GOOD: "badge-cond-good bg-green-950/80 text-green-200 border-green-400/60",
    OK: "badge-cond-ok bg-amber-950/80 text-amber-200 border-amber-400/60",
    POOR: "badge-cond-poor bg-slate-800/80 text-slate-300 border-slate-600/60",
  };

  const styleLabels: Record<string, string> = {
    WAVE: "WAVE",
    BUMP_AND_JUMP: "B&J",
    FLAT: "FLAT",
    CHOP: "CHOP",
  };

  return (
    <section aria-labelledby="daily-forecast-heading" className="w-full">
      <div className="rounded-2xl bg-surf-card border border-surf-border p-5 shadow-lg">
        {/* Section Header & Spot Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2
              id="daily-forecast-heading"
              className="text-base font-extrabold uppercase tracking-tight text-white flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>4-DAY FORECAST OVERVIEW</span>
            </h2>
            <p className="text-xs text-slate-400">
              Solar daylight peak windsurfing conditions (sunrise to sunset) with session quality scores
            </p>
          </div>

          <div className="flex flex-wrap p-1 rounded-xl bg-surf-dark border border-surf-border self-start sm:self-auto gap-1">
            {availableSpots.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSpotId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSpotId === s.id
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
          /* 4-Day Responsive Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {activeForecast?.days?.map((day, idx) => {
              const isToday = idx === 0;
              const hasBestWindow = day.bestWindow && day.bestWindow.durationHours >= 2;

              return (
                <div
                  key={day.date}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    isToday
                      ? "bg-gradient-to-b from-surf-dark/95 to-surf-dark border-sky-500/50 shadow-md shadow-sky-500/10 ring-1 ring-sky-500/20"
                      : "bg-surf-dark/60 border-surf-border/70 hover:border-surf-border"
                  }`}
                >
                  <div>
                    {/* Date & Condition Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-sky-400 [data-theme='daylight']_:text-sky-700 block">
                          {formatDateLabel(day.date, idx)}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 block">
                          {day.date}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shadow-sm ${
                          conditionBadges[day.condition] || "bg-slate-800 text-slate-300 border-slate-600"
                        }`}
                      >
                        {day.condition}
                      </span>
                    </div>

                    {/* Wind Speed & Direction Display */}
                    <div className="flex items-center justify-between my-2 p-2.5 rounded-lg bg-surf-dark/70 border border-surf-border/40">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Daytime Wind
                        </span>
                        <span className="text-2xl font-black font-mono text-white block">
                          {Math.round(day.daytimeMinWind)}–{Math.round(day.daytimeMaxWind)}{" "}
                          <span className="text-xs font-normal text-slate-400">kt</span>
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Gusts {Math.round(day.maxGust)} kt
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-1">
                        <WindArrow
                          rotation={
                            day.dominantDirectionDegrees !== undefined
                              ? (day.dominantDirectionDegrees + 180) % 360
                              : 135
                          }
                          directionLabel={day.dominantDirection}
                          size="md"
                        />
                        <span className="text-xs font-bold font-mono text-cyan-300">
                          {day.dominantDirection}
                        </span>
                      </div>
                    </div>

                    {/* Best Window Highlight */}
                    <div className="mt-2.5 p-2 rounded-lg bg-surf-card/60 border border-surf-border/40 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          <span>Best Window:</span>
                        </span>
                        <span className="font-bold font-mono text-white">
                          {hasBestWindow
                            ? `${day.bestWindow!.start} – ${day.bestWindow!.end}`
                            : "No peak window"}
                        </span>
                      </div>

                      {hasBestWindow && (
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                          <span>
                            {day.bestWindow!.durationHours}h continuous (
                            {Math.round(day.bestWindow!.minWind)}–{Math.round(day.bestWindow!.maxWind)} kt)
                          </span>
                          <span className="text-emerald-400 font-bold">
                            Score {Math.round(day.bestWindow!.meanScore)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Style & Daily Score */}
                  <div className="mt-3 pt-2.5 border-t border-surf-border/40 flex items-center justify-between text-xs">
                    <span className="badge-wave text-[10px] font-bold text-sky-300 flex items-center gap-1">
                      <Waves className="w-3 h-3 text-sky-400" />
                      <span>{styleLabels[day.dominantStyle] || day.dominantStyle}</span>
                    </span>

                    <div className="flex items-center gap-1 text-[11px] font-mono">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold text-white">
                        Score {day.score}/100
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
