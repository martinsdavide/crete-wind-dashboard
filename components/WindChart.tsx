"use client";

import React, { useState, useMemo } from "react";
import { SpotResult } from "@/types/weather";
import { formatTimeHHMM } from "@/lib/bestWindow";
import { LineChart, AlertTriangle } from "lucide-react";

interface WindChartProps {
  kouremenosResult: SpotResult;
  tendaResult: SpotResult;
  xerokamposResult: SpotResult;
}

export const WindChart: React.FC<WindChartProps> = ({
  kouremenosResult,
  tendaResult,
  xerokamposResult,
}) => {
  const [dataMode, setDataMode] = useState<"local" | "model">("local");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const kForecast = kouremenosResult.status === "ok" ? kouremenosResult.data : null;
  const tForecast = tendaResult.status === "ok" ? tendaResult.data : null;
  const xForecast = xerokamposResult.status === "ok" ? xerokamposResult.data : null;

  // Take first 48 hours
  const kHourly = useMemo(() => kForecast?.hourly.slice(0, 48) || [], [kForecast]);
  const tHourly = useMemo(() => tForecast?.hourly.slice(0, 48) || [], [tForecast]);
  const xHourly = useMemo(() => xForecast?.hourly.slice(0, 48) || [], [xForecast]);

  const totalPoints = Math.max(kHourly.length, tHourly.length, xHourly.length);

  // Determine chart bounds
  const maxWind = useMemo(() => {
    let max = 30;
    for (let i = 0; i < totalPoints; i++) {
      if (kHourly[i]) {
        const kVal = dataMode === "local" ? kHourly[i].localWind : kHourly[i].modelWind;
        max = Math.max(max, kVal, kHourly[i].localGust);
      }
      if (tHourly[i]) {
        const tVal = dataMode === "local" ? tHourly[i].localWind : tHourly[i].modelWind;
        max = Math.max(max, tVal, tHourly[i].localGust);
      }
      if (xHourly[i]) {
        const xVal = dataMode === "local" ? xHourly[i].localWind : xHourly[i].modelWind;
        max = Math.max(max, xVal, xHourly[i].localGust);
      }
    }
    return Math.ceil((max + 4) / 5) * 5;
  }, [kHourly, tHourly, xHourly, totalPoints, dataMode]);

  const width = 800;
  const height = 250;
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const getX = (index: number) =>
    paddingLeft + (index / Math.max(1, totalPoints - 1)) * chartWidth;
  const getY = (value: number) =>
    paddingTop + chartHeight - (value / maxWind) * chartHeight;

  // Build SVG path strings
  const kPath = useMemo(() => {
    if (kHourly.length === 0) return "";
    return kHourly
      .map((item, idx) => {
        const val = dataMode === "local" ? item.localWind : item.modelWind;
        return `${idx === 0 ? "M" : "L"} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`;
      })
      .join(" ");
  }, [kHourly, dataMode, maxWind]);

  const tPath = useMemo(() => {
    if (tHourly.length === 0) return "";
    return tHourly
      .map((item, idx) => {
        const val = dataMode === "local" ? item.localWind : item.modelWind;
        return `${idx === 0 ? "M" : "L"} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`;
      })
      .join(" ");
  }, [tHourly, dataMode, maxWind]);

  const xPath = useMemo(() => {
    if (xHourly.length === 0) return "";
    return xHourly
      .map((item, idx) => {
        const val = dataMode === "local" ? item.localWind : item.modelWind;
        return `${idx === 0 ? "M" : "L"} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`;
      })
      .join(" ");
  }, [xHourly, dataMode, maxWind]);

  // Y-axis grid ticks
  const yTicks = useMemo(() => {
    const step = maxWind <= 30 ? 10 : 15;
    const ticks: number[] = [];
    for (let v = 0; v <= maxWind; v += step) {
      ticks.push(v);
    }
    return ticks;
  }, [maxWind]);

  // X-axis time ticks
  const referenceList = kHourly.length > 0 ? kHourly : tHourly.length > 0 ? tHourly : xHourly;
  const xTicks = useMemo(() => {
    const ticks: { index: number; label: string }[] = [];
    for (let i = 0; i < totalPoints; i += 6) {
      const item = referenceList[i];
      if (item) {
        ticks.push({ index: i, label: formatTimeHHMM(item.timestamp) });
      }
    }
    return ticks;
  }, [referenceList, totalPoints]);

  const activeK = hoverIndex !== null && kHourly[hoverIndex] ? kHourly[hoverIndex] : null;
  const activeT = hoverIndex !== null && tHourly[hoverIndex] ? tHourly[hoverIndex] : null;
  const activeX = hoverIndex !== null && xHourly[hoverIndex] ? xHourly[hoverIndex] : null;

  if (totalPoints === 0) {
    return (
      <div className="rounded-2xl bg-surf-card border border-surf-border p-5 text-center text-xs text-slate-400">
        <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-1" />
        Wind evolution chart data currently unavailable.
      </div>
    );
  }

  return (
    <section aria-labelledby="wind-chart-heading" className="w-full">
      <div className="rounded-2xl bg-surf-card border border-surf-border p-5 shadow-lg">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2
              id="wind-chart-heading"
              className="text-base font-extrabold uppercase tracking-tight text-white flex items-center gap-2"
            >
              <LineChart className="w-4 h-4 text-sky-400" />
              <span>3-SPOT WIND COMPARISON CHART</span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive 48-hour evolution between Kouremenos, Tenda & Xerokampos
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              Data:
            </span>
            <div className="inline-flex p-1 rounded-xl bg-surf-dark border border-surf-border">
              <button
                onClick={() => setDataMode("local")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  dataMode === "local"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                LOCAL ESTIMATE
              </button>
              <button
                onClick={() => setDataMode("model")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  dataMode === "model"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                RAW MODEL
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-3 px-1">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-400 inline-block shadow-sm shadow-sky-400/50" />
              <span className="font-bold text-slate-200">
                Kouremenos {kouremenosResult.status === "error" ? "(Offline)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400/50" />
              <span className="font-bold text-slate-200">
                Tenda {tendaResult.status === "error" ? "(Offline)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-400 inline-block shadow-sm shadow-purple-400/50" />
              <span className="font-bold text-slate-200">
                Xerokampos {xerokamposResult.status === "error" ? "(Offline)" : ""}
              </span>
            </div>
          </div>

          <span className="text-[11px] text-slate-400">
            Hover or touch to inspect comparison
          </span>
        </div>

        {/* SVG Interactive Chart */}
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clientX = e.clientX - rect.left;
              const ratio = Math.max(
                0,
                Math.min(1, (clientX / rect.width) * width - paddingLeft) / chartWidth
              );
              const idx = Math.round(ratio * (totalPoints - 1));
              setHoverIndex(Math.max(0, Math.min(totalPoints - 1, idx)));
            }}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const touch = e.touches[0];
              const clientX = touch.clientX - rect.left;
              const ratio = Math.max(
                0,
                Math.min(1, (clientX / rect.width) * width - paddingLeft) / chartWidth
              );
              const idx = Math.round(ratio * (totalPoints - 1));
              setHoverIndex(Math.max(0, Math.min(totalPoints - 1, idx)));
            }}
          >
            {/* Y Grid lines */}
            {yTicks.map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3}
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* X Ticks & Labels */}
            {xTicks.map((tick) => {
              const x = getX(tick.index);
              return (
                <g key={tick.index}>
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={height - paddingBottom}
                    stroke="var(--chart-grid)"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={x}
                    y={height - paddingBottom + 16}
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {/* Kouremenos Line */}
            {kPath && (
              <path
                d={kPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Tenda Line */}
            {tPath && (
              <path
                d={tPath}
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Xerokampos Line */}
            {xPath && (
              <path
                d={xPath}
                fill="none"
                stroke="#c084fc"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Active Hover Guide Line & Dots */}
            {hoverIndex !== null && (
              <g>
                <line
                  x1={getX(hoverIndex)}
                  y1={paddingTop}
                  x2={getX(hoverIndex)}
                  y2={height - paddingBottom}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />

                {activeK && (
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(dataMode === "local" ? activeK.localWind : activeK.modelWind)}
                    r="4.5"
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}

                {activeT && (
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(dataMode === "local" ? activeT.localWind : activeT.modelWind)}
                    r="4.5"
                    fill="#34d399"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}

                {activeX && (
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(dataMode === "local" ? activeX.localWind : activeX.modelWind)}
                    r="4.5"
                    fill="#c084fc"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}
              </g>
            )}
          </svg>
        </div>

        {/* Hover Tooltip Card */}
        {hoverIndex !== null && (activeK || activeT || activeX) && (
          <div className="mt-3 p-3 rounded-xl bg-surf-dark border border-surf-border grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <div className="text-slate-400 flex items-center justify-between sm:justify-start gap-2 border-b sm:border-b-0 pb-1 sm:pb-0">
              <span>Time:</span>
              <strong className="text-white font-mono">
                {formatTimeHHMM((activeK || activeT || activeX)!.timestamp)}
              </strong>
            </div>

            {activeK && (
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1 text-sky-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-sky-400" /> K:
                </span>
                <span className="font-mono text-white text-[11px]">
                  <strong>{Math.round(dataMode === "local" ? activeK.localWind : activeK.modelWind)} kt</strong> {activeK.directionLabel} (Q:{activeK.sessionQualityScore})
                </span>
              </div>
            )}

            {activeT && (
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> T:
                </span>
                <span className="font-mono text-white text-[11px]">
                  <strong>{Math.round(dataMode === "local" ? activeT.localWind : activeT.modelWind)} kt</strong> {activeT.directionLabel} (Q:{activeT.sessionQualityScore})
                </span>
              </div>
            )}

            {activeX && (
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1 text-purple-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-purple-400" /> X:
                </span>
                <span className="font-mono text-white text-[11px]">
                  <strong>{Math.round(dataMode === "local" ? activeX.localWind : activeX.modelWind)} kt</strong> {activeX.directionLabel} (Q:{activeX.sessionQualityScore})
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
