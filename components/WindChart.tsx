"use client";

import React, { useState, useMemo } from "react";
import { SpotForecast } from "@/types/weather";
import { formatTimeHHMM } from "@/lib/bestWindow";
import { LineChart, Sliders } from "lucide-react";

interface WindChartProps {
  kouremenosForecast: SpotForecast;
  tendaForecast: SpotForecast;
}

export const WindChart: React.FC<WindChartProps> = ({
  kouremenosForecast,
  tendaForecast,
}) => {
  const [dataMode, setDataMode] = useState<"local" | "model">("local");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Take the first 48 hours for high-fidelity comparison
  const kHourly = useMemo(() => kouremenosForecast.hourly.slice(0, 48), [kouremenosForecast]);
  const tHourly = useMemo(() => tendaForecast.hourly.slice(0, 48), [tendaForecast]);

  const totalPoints = Math.min(kHourly.length, tHourly.length);

  // Determine chart bounds
  const maxWind = useMemo(() => {
    let max = 30; // base scale
    for (let i = 0; i < totalPoints; i++) {
      const kVal = dataMode === "local" ? kHourly[i].localWind : kHourly[i].modelWind;
      const tVal = dataMode === "local" ? tHourly[i].localWind : tHourly[i].modelWind;
      const kGust = kHourly[i].localGust;
      const tGust = tHourly[i].localGust;
      max = Math.max(max, kVal, tVal, kGust, tGust);
    }
    return Math.ceil((max + 4) / 5) * 5; // rounded to next 5
  }, [kHourly, tHourly, totalPoints, dataMode]);

  // SVG dimensions
  const width = 800;
  const height = 240;
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
    return kHourly
      .slice(0, totalPoints)
      .map((item, idx) => {
        const val = dataMode === "local" ? item.localWind : item.modelWind;
        const x = getX(idx);
        const y = getY(val);
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [kHourly, totalPoints, dataMode, maxWind]);

  const tPath = useMemo(() => {
    return tHourly
      .slice(0, totalPoints)
      .map((item, idx) => {
        const val = dataMode === "local" ? item.localWind : item.modelWind;
        const x = getX(idx);
        const y = getY(val);
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [tHourly, totalPoints, dataMode, maxWind]);

  // Y-axis grid ticks (e.g. 0, 10, 20, 30, 40 kt)
  const yTicks = useMemo(() => {
    const step = maxWind <= 30 ? 10 : 15;
    const ticks: number[] = [];
    for (let v = 0; v <= maxWind; v += step) {
      ticks.push(v);
    }
    return ticks;
  }, [maxWind]);

  // X-axis time ticks (every 6 hours)
  const xTicks = useMemo(() => {
    const ticks: { index: number; label: string; dateLabel?: string }[] = [];
    for (let i = 0; i < totalPoints; i += 6) {
      const item = kHourly[i];
      const timeStr = formatTimeHHMM(item.timestamp);
      ticks.push({ index: i, label: timeStr });
    }
    return ticks;
  }, [kHourly, totalPoints]);

  const activeK = hoverIndex !== null ? kHourly[hoverIndex] : null;
  const activeT = hoverIndex !== null ? tHourly[hoverIndex] : null;

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
              <span>WIND EVOLUTION & SPOT COMPARISON</span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive 48-hour comparison between Kouremenos & Tenda
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-400 inline-block shadow-sm shadow-sky-400/50" />
              <span className="font-bold text-slate-200">Kouremenos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400/50" />
              <span className="font-bold text-slate-200">Tenda</span>
            </div>
          </div>

          <span className="text-[11px] text-slate-400">
            Hover or touch chart to compare point values
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
            <defs>
              <linearGradient id="kGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="tGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
              </linearGradient>
            </defs>

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
                    stroke="#1e293b"
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
                    stroke="#1e293b"
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
            <path
              d={kPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Tenda Line */}
            <path
              d={tPath}
              fill="none"
              stroke="#34d399"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

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
                    cy={getY(
                      dataMode === "local" ? activeK.localWind : activeK.modelWind
                    )}
                    r="5"
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}

                {activeT && (
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(
                      dataMode === "local" ? activeT.localWind : activeT.modelWind
                    )}
                    r="5"
                    fill="#34d399"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}
              </g>
            )}
          </svg>
        </div>

        {/* Hover / Touch Tooltip Card */}
        {hoverIndex !== null && activeK && activeT && (
          <div className="mt-3 p-3 rounded-xl bg-surf-dark border border-surf-border grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="text-slate-400 flex items-center justify-between sm:justify-start gap-2 border-b sm:border-b-0 pb-1 sm:pb-0">
              <span>Time:</span>
              <strong className="text-white font-mono">
                {formatTimeHHMM(activeK.timestamp)} (Athens)
              </strong>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-sky-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Kouremenos:
              </span>
              <span className="font-mono text-white">
                <strong>
                  {Math.round(
                    dataMode === "local" ? activeK.localWind : activeK.modelWind
                  )}{" "}
                  kt
                </strong>{" "}
                {activeK.directionLabel} (G: {Math.round(activeK.localGust)})
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Tenda:
              </span>
              <span className="font-mono text-white">
                <strong>
                  {Math.round(
                    dataMode === "local" ? activeT.localWind : activeT.modelWind
                  )}{" "}
                  kt
                </strong>{" "}
                {activeT.directionLabel} (G: {Math.round(activeT.localGust)})
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
