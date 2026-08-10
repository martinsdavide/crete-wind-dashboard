"use client";

import React, { useState, useEffect } from "react";
import { SpotResult } from "@/types/weather";
import { SpotId } from "@/types/spot";
import { WindArrow } from "./WindArrow";
import { Calendar, Clock, Wind, Flame, AlertTriangle, Waves } from "lucide-react";

interface DailyForecastProps {
  kouremenosResult: SpotResult;
  tendaResult: SpotResult;
  xerokamposResult: SpotResult;
  defaultSpotId?: SpotId | string | null;
}

export const DailyForecast: React.FC<DailyForecastProps> = ({
  kouremenosResult,
  tendaResult,
  xerokamposResult,
  defaultSpotId,
}) => {
  const [activeSpotId, setActiveSpotId] = useState<SpotId>(
    (defaultSpotId as SpotId) || "kouremenos"
  );

  // Dynamically sync default selection with best spot of the day
  useEffect(() => {
    if (defaultSpotId) {
      setActiveSpotId(defaultSpotId as SpotId);
    }
  }, [defaultSpotId]);

  const activeResult =
    activeSpotId === "kouremenos"
      ? kouremenosResult
      : activeSpotId === "tenda"
      ? tendaResult
      : xerokamposResult;

  const activeForecast = activeResult?.status === "ok" ? activeResult.data : null;

  const formatDateLabel = (dateStr: string, index: number) => {
    if (index === 0) return "TODAY";
    if (index === 1) return "TOMORROW";

    try {
      const date = new Date(dateStr + "T12:00:00Z");
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Athens",
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

          <div className="inline-flex p-1 rounded-xl bg-surf-dark border border-surf-border self-start sm:self-auto">
            <button
              onClick={() => setActiveSpotId("kouremenos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSpotId === "kouremenos"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Kouremenos
            </button>
            <button
              onClick={() => setActiveSpotId("tenda")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSpotId === "tenda"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tenda
            </button>
            <button
              onClick={() => setActiveSpotId("xerokampos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSpotId === "xerokampos"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Xerokampos
            </button>
          </div>
        </div>

        {/* Spot Offline State */}
        {activeResult?.status === "error" && (
          <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Daily forecast currently unavailable for this spot.</span>
          </div>
        )}

        {/* 4-Day Grid */}
        {activeResult?.status !== "error" && activeForecast && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeForecast.days.slice(0, 4).map((day, idx) => {
              const badgeClass = conditionBadges[day.condition] || conditionBadges.OK;
              const arrowRotation = (day.dominantDirectionDegrees + 180) % 360;

              return (
                <div
                  key={day.date}
                  className="flex flex-col justify-between p-4 rounded-xl bg-surf-dark/60 border border-surf-border/60 hover:border-surf-border transition-all"
                >
                  <div>
                    {/* Date & Condition Badge */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-xs font-black tracking-wider text-slate-300">
                        {formatDateLabel(day.date, idx)}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border shadow-sm ${badgeClass}`}
                      >
                        {day.condition}
                      </span>
                    </div>

                    {/* Daytime Wind Range & Direction */}
                    <div className="flex items-center justify-between py-2 border-b border-surf-border/40">
                      <div>
                        <span className="text-2xl font-black font-mono text-white">
                          {Math.round(day.daytimeMinWind)}–{Math.round(day.daytimeMaxWind)}{" "}
                          <span className="text-xs font-normal text-sky-400">kt</span>
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          24h: {Math.round(day.minWind)}–{Math.round(day.maxWind)} kt
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-right">
                        <span className="text-sm font-bold font-mono text-slate-200">
                          {day.dominantDirection}
                        </span>
                        <WindArrow
                          rotation={arrowRotation}
                          directionLabel={day.dominantDirection}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Best Window & Metrics */}
                  <div className="mt-3 space-y-2 text-xs">
                    {day.bestWindow ? (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-surf-card/80 border border-surf-border/40">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          <span className="text-[11px] font-mono font-bold">
                            {day.bestWindow.start} – {day.bestWindow.end}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-sky-300">
                          {Math.round(day.bestWindow.minWind)}–{Math.round(day.bestWindow.maxWind)} kt
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-surf-card/40 border border-surf-border/30 text-[11px] text-slate-400">
                        <span>No peak window (&ge;70)</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono font-bold text-slate-200">
                          Quality {day.score}/100
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-slate-300">
                        <Wind className="w-3 h-3 text-slate-400" />
                        <span>
                          Gust <strong className="text-amber-400">{Math.round(day.maxGust)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Dominant Style Tag */}
                    <div className="flex items-center justify-between pt-1 border-t border-surf-border/30 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                        <Waves className="w-3 h-3" />
                        <span>{styleLabels[day.dominantStyle] || day.dominantStyle}</span>
                      </span>
                      <span className="font-mono uppercase font-bold text-slate-400">
                        {day.dominantEligibility}
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
