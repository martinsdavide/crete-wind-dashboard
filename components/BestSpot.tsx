"use client";

import React from "react";
import { Recommendation, SpotResult } from "@/types/weather";
import { Compass, Clock, Award, Flame, Wind, Sparkles, Waves, AlertCircle } from "lucide-react";

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
            {/* Ultra-legible Regime Badge (e.g. Westerly Flow, Strong Meltemi) */}
            {regimeLabel && (
              <span className="badge-regime px-3 py-0.5 rounded-full text-[11px] font-extrabold shadow-sm border">
                {regimeLabel}
              </span>
            )}
            {score !== null && score > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surf-dark/80 border border-surf-border shadow-sm">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-mono font-bold text-white">
                  Session Quality {score}/100
                </span>
              </div>
            )}
          </div>
        </div>

        {bestSpot && bestSpotName ? (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
                  {bestSpotName}
                </h3>
                <p className="text-xs text-slate-400">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surf-border/60">
              {/* Window Box */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60">
                <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block">
                    BEST TIME WINDOW
                  </span>
                  <span className="text-base font-extrabold font-mono text-white">
                    {bestWindow
                      ? `${bestWindow.start} – ${bestWindow.end}`
                      : "09:00 – 20:00 (Daytime Peak)"}
                  </span>
                </div>
              </div>

              {/* Wind & Direction Box */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surf-dark/60 border border-surf-border/60">
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block">
                    EXPECTED WIND
                  </span>
                  <span className="text-base font-extrabold text-cyan-300 flex items-center gap-1.5">
                    <span>
                      {bestWindow
                        ? `${bestWindow.minWind}–${bestWindow.maxWind} kt`
                        : todaySummary
                        ? `${todaySummary.daytimeMinWind}–${todaySummary.daytimeMaxWind} kt`
                        : "Calm"}
                    </span>
                    <span className="text-white font-mono text-sm px-1.5 py-0.5 rounded bg-surf-card border border-surf-border font-bold">
                      {bestWindow?.dominantDirection || todaySummary?.dominantDirection || "NW"}
                    </span>
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

            {/* 3-Spot Comparison Bar */}
            <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 gap-2">
              <span>
                Session Scores:{" "}
                <strong className="text-slate-200 font-bold">
                  Kouremenos ({dayScoreKouremenos ?? "N/A"})
                </strong>{" "}
                •{" "}
                <strong className="text-slate-200 font-bold">
                  Tenda ({dayScoreTenda ?? "N/A"})
                </strong>{" "}
                •{" "}
                <strong className="text-slate-200 font-bold">
                  Xerokampos ({dayScoreXerokampos ?? "N/A"})
                </strong>
              </span>
              {todaySummary?.maxGust ? (
                <span className="flex items-center gap-1 text-slate-300 font-medium">
                  <Wind className="w-3 h-3 text-slate-400" />
                  Peak Gust: <strong className="text-amber-400 font-bold">{todaySummary.maxGust} kt</strong>
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
                <strong className="text-slate-200">Kouremenos ({dayScoreKouremenos ?? 0})</strong> •{" "}
                <strong className="text-slate-200">Tenda ({dayScoreTenda ?? 0})</strong> •{" "}
                <strong className="text-slate-200">Xerokampos ({dayScoreXerokampos ?? 0})</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
