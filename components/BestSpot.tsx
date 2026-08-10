"use client";

import React, { useMemo, useState } from "react";
import { Recommendation, SpotResult } from "@/types/weather";
import {
  Compass,
  Clock,
  Award,
  Flame,
  Wind,
  Sparkles,
  Waves,
  AlertCircle,
  Activity,
  Star,
  Sunset,
  Beer,
  ArrowRight,
  Sun,
} from "lucide-react";
import { getSolarWindow } from "@/lib/solar";

interface BestSpotProps {
  recommendation: Recommendation;
  spots?: Record<string, SpotResult>;
  spotList?: SpotResult[];
  timezone?: string;
  // Legacy optional named props for backward compatibility
  kouremenosResult?: SpotResult;
  tendaResult?: SpotResult;
  xerokamposResult?: SpotResult;
}

export const BestSpot: React.FC<BestSpotProps> = ({
  recommendation,
  spots,
  spotList,
  timezone = "Europe/Athens",
  kouremenosResult,
  tendaResult,
  xerokamposResult,
}) => {
  const [nightViewTab, setNightViewTab] = useState<"tomorrow" | "today">("tomorrow");

  const {
    bestSpot,
    bestSpotName,
    bestWindow,
    score,
    spotScores = {},
    regimeLabel,
    sailingStyle,
    explanation,
  } = recommendation;

  // Extract all spot results dynamically for ANY region
  const spotResults = useMemo(() => {
    if (spotList && spotList.length > 0) {
      return spotList.filter(Boolean);
    }
    if (spots && Object.keys(spots).length > 0) {
      return Object.values(spots).filter(Boolean);
    }
    return [kouremenosResult, tendaResult, xerokamposResult].filter(Boolean) as SpotResult[];
  }, [spotList, spots, kouremenosResult, tendaResult, xerokamposResult]);

  // Find the winning spot forecast dynamically
  const chosenResult =
    spotResults.find((r) => {
      if (!r) return false;
      const spotId = r.status === "ok" ? r.data.spot.id : r.spot.id;
      return spotId === bestSpot;
    }) || null;

  const chosenForecast = chosenResult?.status === "ok" ? chosenResult.data : null;
  const todaySummary = chosenForecast?.days[0];
  const tomorrowSummary = chosenForecast?.days[1];
  const stability = bestWindow?.stability;

  // Determine if it's currently post-sunset / nighttime in the region's local timezone
  const isPostSunset = useMemo(() => {
    try {
      const now = new Date();
      const lat = chosenForecast?.spot.latitude ?? 35.19;
      const lon = chosenForecast?.spot.longitude ?? 26.27;
      const solar = getSolarWindow(now, lat, lon, timezone);
      const localHourStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(now);
      const localHour = parseInt(localHourStr, 10);
      return localHour >= solar.endHour || localHour < solar.startHour;
    } catch {
      return false;
    }
  }, [chosenForecast, timezone]);

  const conditionGradients: Record<string, string> = {
    EXCELLENT: "from-sky-500/20 via-cyan-500/10 to-transparent border-sky-500/40 text-sky-200",
    "VERY GOOD": "from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500/40 text-emerald-200",
    GOOD: "from-green-500/20 via-emerald-500/10 to-transparent border-green-500/40 text-green-200",
    OK: "from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/40 text-amber-200",
    POOR: "from-slate-500/20 via-slate-600/10 to-transparent border-slate-600 text-slate-300",
  };

  const currentCondition = todaySummary?.condition || (score !== null && score >= 75 ? "VERY GOOD" : "OK");
  const gradientClass = bestSpotName
    ? isPostSunset
      ? "from-amber-500/15 via-orange-500/5 to-transparent border-amber-500/30 text-amber-200"
      : conditionGradients[currentCondition] || conditionGradients.OK
    : "from-slate-800/40 to-surf-dark/80 border-surf-border text-slate-300";

  const styleLabels: Record<string, string> = {
    WAVE: "WAVE / RAMPS",
    BUMP_AND_JUMP: "BUMP & JUMP",
    FLAT: "FLAT WATER",
    CHOP: "CHOPPY",
  };

  // Dynamically sort session scores by order of score
  const sortedSessionScores = useMemo(() => {
    const formatName = (id: string) => {
      const found = spotResults.find((r) => {
        if (!r) return false;
        const sId = r.status === "ok" ? r.data.spot.id : r.spot.id;
        return sId === id;
      });
      if (found) {
        return found.status === "ok" ? found.data.spot.name : found.spot.name;
      }
      return id.charAt(0).toUpperCase() + id.slice(1);
    };

    const list = Object.entries(spotScores).map(([id, scoreVal]) => ({
      id,
      name: formatName(id),
      score: scoreVal,
      numScore: typeof scoreVal === "number" ? scoreVal : -1,
    }));

    return list.sort((a, b) => {
      if (bestSpot === a.id) return -1;
      if (bestSpot === b.id) return 1;

      if (b.numScore !== a.numScore) {
        return b.numScore - a.numScore;
      }
      return 0;
    });
  }, [spotScores, bestSpot, spotResults]);

  // Confidence styling
  const confidenceBadges: Record<string, { label: string; bg: string; text: string; border: string }> = {
    HIGH: {
      label: "HIGH CONFIDENCE",
      bg: "bg-emerald-950/70 [data-theme='daylight']_:bg-emerald-100",
      text: "text-emerald-300 [data-theme='daylight']_:text-emerald-800",
      border: "border-emerald-500/50 [data-theme='daylight']_:border-emerald-400",
    },
    MEDIUM: {
      label: "MEDIUM CONFIDENCE",
      bg: "bg-amber-950/70 [data-theme='daylight']_:bg-amber-100",
      text: "text-amber-300 [data-theme='daylight']_:text-amber-800",
      border: "border-amber-500/50 [data-theme='daylight']_:border-amber-400",
    },
    LOW: {
      label: "LOW CONFIDENCE",
      bg: "bg-rose-950/70 [data-theme='daylight']_:bg-rose-100",
      text: "text-rose-300 [data-theme='daylight']_:text-rose-800",
      border: "border-rose-500/50 [data-theme='daylight']_:border-rose-400",
    },
  };

  const currentConfidence = stability?.confidence || "HIGH";
  const confStyle = confidenceBadges[currentConfidence] || confidenceBadges.HIGH;

  const getStabilityDot = (label?: string) => {
    if (label === "Very Stable" || label === "Stable" || label === "Smooth") {
      return "bg-emerald-400 shadow-sm shadow-emerald-400/50";
    }
    if (label === "Variable" || label === "Slightly Gusty" || label === "Gusty") {
      return "bg-amber-400 shadow-sm shadow-amber-400/50";
    }
    return "bg-rose-400 shadow-sm shadow-rose-400/50";
  };

  const starCount = score !== null ? Math.max(1, Math.min(5, Math.round((score / 100) * 5))) : 4;

  // Funny surf / taverna quotes
  const tavernaQuotes = [
    "The sun has dipped into the Aegean! Sails rolled, fins rinsed — time for a cold Mythos and grilled octopus at the taverna. You earned it! 🍻🐙",
    "Night-vision fins haven't been invented yet! Session's officially closed, taverna session officially open. 🍺",
    "Sun's down! Rest your forearms, recharge with tzatziki & gyros, and get ready for tomorrow's blasts! 🇬🇷💨",
  ];
  const selectedQuote = tavernaQuotes[0];

  return (
    <section aria-labelledby="best-today-heading" className="w-full">
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-b ${gradientClass} border bg-surf-card/90 p-5 sm:p-6 shadow-xl backdrop-blur-md transition-all`}
      >
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-sky-400/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-lg ${
                isPostSunset
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : bestSpot
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                  : "bg-slate-700/40 text-slate-400 border border-slate-600"
              }`}
            >
              {isPostSunset ? <Beer className="w-4 h-4" /> : <Award className="w-4 h-4" />}
            </span>
            <div>
              <h2
                id="best-today-heading"
                className={`text-xs font-black tracking-wider uppercase ${
                  isPostSunset ? "text-amber-400" : "text-sky-400"
                }`}
              >
                {isPostSunset ? "SUN HAS SET • TAVERNA TIME 🍻" : "RECOMMENDED SPOT FOR TODAY"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPostSunset && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Sunset className="w-3 h-3" />
                <span>Après-Surf</span>
              </span>
            )}
            {regimeLabel && (
              <span className="badge-regime px-3 py-0.5 rounded-full text-[11px] font-extrabold shadow-sm border">
                {regimeLabel}
              </span>
            )}
            {score !== null && score > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surf-dark/80 border border-surf-border shadow-sm">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-mono font-bold text-white">
                  Quality {score}/100
                </span>
              </div>
            )}
          </div>
        </div>

        {/* POST-SUNSET / TAVERNA TIME MODE */}
        {isPostSunset && bestSpot && bestSpotName ? (
          <div className="space-y-4">
            {/* Witty Banner */}
            <div className="p-3.5 rounded-xl bg-amber-950/40 [data-theme='daylight']_:bg-amber-100/80 border border-amber-500/30 text-amber-200 [data-theme='daylight']_:text-amber-900 text-xs flex items-start gap-3 shadow-inner">
              <span className="text-2xl select-none">🐙</span>
              <div className="space-y-1">
                <p className="font-bold text-[12px] leading-snug">
                  {selectedQuote}
                </p>
                <p className="text-[11px] text-amber-300/80 [data-theme='daylight']_:text-amber-800">
                  Daylight sessions have concluded for today. Check out tomorrow&apos;s outlook below!
                </p>
              </div>
            </div>

            {/* Toggle Tabs: Tomorrow's Call vs Today's Recap */}
            <div className="flex items-center gap-2 border-b border-surf-border/60 pb-2">
              <button
                type="button"
                onClick={() => setNightViewTab("tomorrow")}
                className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  nightViewTab === "tomorrow"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                    : "bg-surf-dark/60 text-slate-400 hover:text-slate-200 border border-surf-border/40"
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Tomorrow&apos;s Call</span>
              </button>
              <button
                type="button"
                onClick={() => setNightViewTab("today")}
                className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  nightViewTab === "today"
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                    : "bg-surf-dark/60 text-slate-400 hover:text-slate-200 border border-surf-border/40"
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Today&apos;s Winner Recap</span>
              </button>
            </div>

            {/* TOMORROW'S PREVIEW TAB */}
            {nightViewTab === "tomorrow" && tomorrowSummary && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 block mb-0.5">
                      EARLY FORECAST FOR TOMORROW
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
                      {bestSpotName}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <span className="badge-wave inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold tracking-wide shadow-sm border">
                      <Waves className="w-3.5 h-3.5 text-sky-400" />
                      <span>{styleLabels[tomorrowSummary.dominantStyle] || tomorrowSummary.dominantStyle}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                      <Wind className="w-3.5 h-3.5 text-sky-400" />
                      <span>EXPECTED WIND</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black font-mono text-cyan-300 block">
                      {Math.round(tomorrowSummary.daytimeMinWind)}–{Math.round(tomorrowSummary.daytimeMaxWind)}{" "}
                      <span className="text-xs font-normal text-slate-300">kt</span>
                    </span>
                    <span className="text-[11px] text-slate-300 mt-0.5 block">
                      Gusts to {Math.round(tomorrowSummary.maxGust)} kt
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                      <Compass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>DIRECTION</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black font-mono text-white block">
                      {tomorrowSummary.dominantDirection}
                    </span>
                    <span className="text-[11px] text-slate-300 mt-0.5 block">
                      Favorable angle
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>BEST WINDOW</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black font-mono text-white block">
                      {tomorrowSummary.bestWindow
                        ? `${tomorrowSummary.bestWindow.start} – ${tomorrowSummary.bestWindow.end}`
                        : "11:00 – 17:00"}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      {tomorrowSummary.bestWindow
                        ? `${tomorrowSummary.bestWindow.durationHours}h continuous window`
                        : "Daylight window"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>SESSION QUALITY</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black font-mono text-amber-400 block">
                      {tomorrowSummary.score}/100
                    </span>
                    <span className="text-[11px] text-slate-300 mt-0.5 block">
                      {tomorrowSummary.condition}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TODAY'S RECAP TAB */}
            {nightViewTab === "today" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-0.5">
                      TODAY&apos;S WINNING SPOT
                    </span>
                    <h3 className="text-2xl font-extrabold text-white tracking-tight uppercase">
                      {bestSpotName}
                    </h3>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-xs">
                    Score {score}/100
                  </span>
                </div>
                {explanation && explanation.length > 0 && (
                  <div className="p-3 rounded-xl bg-surf-dark/70 border border-surf-border/60 text-xs text-slate-300 space-y-1">
                    {explanation.map((item, idx) => (
                      <p key={idx} className="leading-relaxed text-[11px]">
                        • {item}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Session Scores comparison bar */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 gap-2 pt-2 border-t border-surf-border/40">
              <span>
                Today&apos;s Scores:{" "}
                {sortedSessionScores.map((s, idx) => (
                  <React.Fragment key={s.id}>
                    <strong
                      className={`font-bold ${
                        bestSpot === s.id
                          ? "text-amber-300 font-black"
                          : "text-slate-300"
                      }`}
                    >
                      {s.name} ({s.score !== null && s.score !== undefined ? s.score : "N/A"})
                    </strong>
                    {idx < sortedSessionScores.length - 1 ? " • " : ""}
                  </React.Fragment>
                ))}
              </span>
            </div>
          </div>
        ) : bestSpot && bestSpotName ? (
          /* STANDARD DAYTIME RECOMMENDED SPOT CARD */
          <div>
            {/* Spot Title & Stars */}
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
                    {bestSpotName}
                  </h3>
                  {/* 5-Star Rating */}
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= starCount
                            ? "fill-amber-400 text-amber-400"
                            : "fill-slate-600/40 text-slate-600"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {chosenForecast?.spot?.subtitle || chosenForecast?.spot?.name || "Optimal conditions today"}
                </p>
              </div>

              {/* High-Contrast Sailing Style Badge */}
              <div className="flex items-center gap-2 self-start">
                <span className="badge-wave inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold tracking-wide shadow-sm border">
                  <Waves className="w-3.5 h-3.5 text-sky-400" />
                  <span>{styleLabels[sailingStyle] || sailingStyle}</span>
                  <span className="text-[9px] opacity-75 font-medium">(ESTIMATED)</span>
                </span>
              </div>
            </div>

            {/* 4-Metric Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-surf-border/60">
              {/* 1. Wind Range */}
              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60 flex flex-col justify-between">
                <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <Wind className="w-3.5 h-3.5 text-sky-400" />
                  <span>WIND RANGE</span>
                </div>
                <div>
                  <span className="text-xl sm:text-2xl font-black font-mono text-cyan-300 block">
                    {stability
                      ? `${Math.round(stability.minWind)}–${Math.round(stability.maxWind)}`
                      : bestWindow
                      ? `${Math.round(bestWindow.minWind)}–${Math.round(bestWindow.maxWind)}`
                      : todaySummary
                      ? `${Math.round(todaySummary.daytimeMinWind)}–${Math.round(todaySummary.daytimeMaxWind)}`
                      : "—"}{" "}
                    <span className="text-xs font-normal text-slate-300">kt</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-300 mt-0.5 font-medium">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${getStabilityDot(
                        stability?.windStabilityLabel
                      )}`}
                    />
                    <span>{stability?.windStabilityLabel || "Stable"}</span>
                  </span>
                </div>
              </div>

              {/* 2. Direction Range */}
              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60 flex flex-col justify-between">
                <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  <span>DIRECTION</span>
                </div>
                <div>
                  <span className="text-xl sm:text-2xl font-black font-mono text-white block">
                    {stability?.directionRangeLabel ||
                      bestWindow?.dominantDirection ||
                      todaySummary?.dominantDirection ||
                      "NW"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-300 mt-0.5 font-medium">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${getStabilityDot(
                        stability?.directionStabilityLabel
                      )}`}
                    />
                    <span>
                      {stability && stability.directionRange <= 15
                        ? "Steady airflow"
                        : stability?.directionStabilityLabel || "Consistent"}
                    </span>
                  </span>
                </div>
              </div>

              {/* 3. Gustiness & Quality */}
              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60 flex flex-col justify-between">
                <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>AIRFLOW QUALITY</span>
                </div>
                <div>
                  <span className="text-lg sm:text-xl font-extrabold text-slate-100 block">
                    {stability?.gustinessLabel || "Smooth wind"}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {stability
                      ? `Gust factor ${stability.gustFactor}x`
                      : todaySummary
                      ? `Gusts to ${Math.round(todaySummary.maxGust)} kt`
                      : "Low turbulence"}
                  </span>
                </div>
              </div>

              {/* 4. Best Window & Confidence */}
              <div className="p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>BEST WINDOW</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${confStyle.bg} ${confStyle.text} ${confStyle.border}`}
                  >
                    {confStyle.label}
                  </span>
                </div>
                <div>
                  <span className="text-xl sm:text-2xl font-black font-mono text-white block">
                    {bestWindow
                      ? `${bestWindow.start} – ${bestWindow.end}`
                      : "07:00 – 20:00"}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {bestWindow
                      ? `${bestWindow.durationHours}h continuous session`
                      : "Daylight forecast"}
                  </span>
                </div>
              </div>
            </div>

            {/* Explanation Rationale Box */}
            {explanation && explanation.length > 0 && (
              <div className="mt-3 p-3.5 rounded-xl bg-surf-dark/80 border border-surf-border text-xs space-y-1.5 shadow-sm">
                <div className="flex items-center gap-1.5 font-extrabold text-sky-400 text-[11px] uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Why {bestSpotName}?</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-200 leading-relaxed text-[11px]">
                  {explanation.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dynamically Ordered Comparison Bar */}
            <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 gap-2">
              <span>
                Session Scores:{" "}
                {sortedSessionScores.map((s, idx) => (
                  <React.Fragment key={s.id}>
                    <strong
                      className={`font-bold ${
                        bestSpot === s.id
                          ? "text-cyan-300 [data-theme='daylight']_:text-cyan-800 font-black"
                          : "text-slate-200"
                      }`}
                    >
                      {s.name} ({s.score !== null && s.score !== undefined ? s.score : "N/A"})
                    </strong>
                    {idx < sortedSessionScores.length - 1 ? " • " : ""}
                  </React.Fragment>
                ))}
              </span>
              {todaySummary?.maxGust ? (
                <span className="flex items-center gap-1 text-slate-300 font-medium">
                  <Wind className="w-3 h-3 text-slate-400" />
                  Peak Gust: <strong className="text-amber-400 font-bold">{Math.round(todaySummary.maxGust)} kt</strong>
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          /* NO RECOMMENDED SPOT STATE */
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-700/40 border border-slate-600 text-amber-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  NO RECOMMENDED SPOT TODAY
                </h3>
                <p className="text-xs text-slate-400">
                  No spot meets the required &ge;60 session quality criteria or minimum continuous window
                </p>
              </div>
            </div>

            {explanation && explanation.length > 0 && (
              <div className="p-3 rounded-xl bg-surf-dark/70 border border-surf-border/60 text-xs text-slate-300">
                {explanation.map((item, idx) => (
                  <p key={idx} className="leading-relaxed text-[12px]">{item}</p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-surf-border/40">
              <span>
                Day Session Scores:{" "}
                {sortedSessionScores.map((s, idx) => (
                  <React.Fragment key={s.id}>
                    <strong className="text-slate-200">
                      {s.name} ({s.score ?? 0})
                    </strong>
                    {idx < sortedSessionScores.length - 1 ? " • " : ""}
                  </React.Fragment>
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
