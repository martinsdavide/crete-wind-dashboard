"use client";

import React, { useMemo } from "react";
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
} from "lucide-react";

interface BestSpotProps {
  recommendation: Recommendation;
  kouremenosResult: SpotResult;
  tendaResult: SpotResult;
  xerokamposResult: SpotResult;
}

export const BestSpot: React.FC<BestSpotProps> = ({
  recommendation,
  kouremenosResult,
  tendaResult,
  xerokamposResult,
}) => {
  const {
    bestSpot,
    bestSpotName,
    bestWindow,
    score,
    dayScoreKouremenos,
    dayScoreTenda,
    dayScoreXerokampos,
    regimeLabel,
    sailingStyle,
    explanation,
  } = recommendation;

  const chosenResult =
    bestSpot === "kouremenos"
      ? kouremenosResult
      : bestSpot === "tenda"
      ? tendaResult
      : bestSpot === "xerokampos"
      ? xerokamposResult
      : null;

  const chosenForecast = chosenResult?.status === "ok" ? chosenResult.data : null;
  const todaySummary = chosenForecast?.days[0];
  const stability = bestWindow?.stability;

  const conditionGradients: Record<string, string> = {
    EXCELLENT: "from-sky-500/20 via-cyan-500/10 to-transparent border-sky-500/40 text-sky-200",
    "VERY GOOD": "from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500/40 text-emerald-200",
    GOOD: "from-green-500/20 via-emerald-500/10 to-transparent border-green-500/40 text-green-200",
    OK: "from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/40 text-amber-200",
    POOR: "from-slate-500/20 via-slate-600/10 to-transparent border-slate-600 text-slate-300",
  };

  const currentCondition = todaySummary?.condition || (score !== null && score >= 75 ? "VERY GOOD" : "OK");
  const gradientClass = bestSpotName
    ? conditionGradients[currentCondition] || conditionGradients.OK
    : "from-slate-800/40 to-surf-dark/80 border-surf-border text-slate-300";

  const styleLabels: Record<string, string> = {
    WAVE: "WAVE / RAMPS",
    BUMP_AND_JUMP: "BUMP & JUMP",
    FLAT: "FLAT WATER",
    CHOP: "CHOPPY",
  };

  // Dynamically sort session scores by order of score
  const sortedSessionScores = useMemo(() => {
    const defaultOrder = ["kouremenos", "tenda", "xerokampos"];
    const list = [
      {
        id: "kouremenos",
        name: "Kouremenos",
        score: dayScoreKouremenos,
        numScore: typeof dayScoreKouremenos === "number" ? dayScoreKouremenos : -1,
      },
      {
        id: "tenda",
        name: "Tenda",
        score: dayScoreTenda,
        numScore: typeof dayScoreTenda === "number" ? dayScoreTenda : -1,
      },
      {
        id: "xerokampos",
        name: "Xerokampos",
        score: dayScoreXerokampos,
        numScore: typeof dayScoreXerokampos === "number" ? dayScoreXerokampos : -1,
      },
    ];

    return list.sort((a, b) => {
      // The recommended Best Spot winner leads if scores are equal or leading
      if (bestSpot === a.id) return -1;
      if (bestSpot === b.id) return 1;

      if (b.numScore !== a.numScore) {
        return b.numScore - a.numScore;
      }
      return defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id);
    });
  }, [dayScoreKouremenos, dayScoreTenda, dayScoreXerokampos, bestSpot]);

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

  // Stability Dot Colors
  const getStabilityDot = (label?: string) => {
    if (label === "Very Stable" || label === "Stable" || label === "Smooth") {
      return "bg-emerald-400 shadow-sm shadow-emerald-400/50";
    }
    if (label === "Variable" || label === "Slightly Gusty" || label === "Gusty") {
      return "bg-amber-400 shadow-sm shadow-amber-400/50";
    }
    return "bg-rose-400 shadow-sm shadow-rose-400/50";
  };

  // 5-Star visual rating
  const starCount = score !== null ? Math.max(1, Math.min(5, Math.round((score / 100) * 5))) : 4;

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
                bestSpot
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                  : "bg-slate-700/40 text-slate-400 border border-slate-600"
              }`}
            >
              <Award className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="best-today-heading"
                className="text-xs font-black tracking-wider uppercase text-sky-400"
              >
                RECOMMENDED SPOT FOR TODAY
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Regime Badge */}
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

        {bestSpot && bestSpotName ? (
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
                  {bestSpot === "kouremenos"
                    ? "Palekastro Bay • Thermal Sweetspot"
                    : bestSpot === "tenda"
                    ? "Cape Sidero • Wave & Strong Meltemi"
                    : "South-East Crete • W/SW Alternative Regime"}
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

            {/* 4-Metric Grid: Wind Range, Direction Range, Stability & Gustiness, Best Window & Confidence */}
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

            {/* 3-Spot Dynamically Ordered Comparison Bar */}
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
