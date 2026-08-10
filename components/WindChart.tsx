"use client";

import React, { useState, useMemo } from "react";
import { SpotResult } from "@/types/weather";
import { formatTimeHHMM } from "@/lib/bestWindow";
import { LineChart, AlertTriangle } from "lucide-react";

interface WindChartProps {
  spots?: Record<string, SpotResult>;
  spotList?: SpotResult[];
  timezone?: string;
  // Legacy optional props for backward compatibility
  kouremenosResult?: SpotResult;
  tendaResult?: SpotResult;
  xerokamposResult?: SpotResult;
}

const SPOT_PALETTE = [
  "#38bdf8", // Sky Blue
  "#34d399", // Emerald
  "#c084fc", // Purple
  "#fbbf24", // Amber
  "#f43f5e", // Rose
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

export const WindChart: React.FC<WindChartProps> = ({
  spots,
  spotList,
  timezone = "Europe/Athens",
  kouremenosResult,
  tendaResult,
  xerokamposResult,
}) => {
  const [dataMode, setDataMode] = useState<"local" | "model">("local");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Dynamically resolve all spots
  const allSpotResults = useMemo(() => {
    if (spotList && spotList.length > 0) return spotList.filter(Boolean);
    if (spots && Object.keys(spots).length > 0) return Object.values(spots).filter(Boolean);
    return [kouremenosResult, tendaResult, xerokamposResult].filter(Boolean) as SpotResult[];
  }, [spotList, spots, kouremenosResult, tendaResult, xerokamposResult]);

  // Take upcoming 48 hours from current time forward
  const seriesList = useMemo(() => {
    return allSpotResults.map((r, idx) => {
      const isOk = r.status === "ok";
      const forecast = isOk ? r.data : null;
      const id = isOk ? r.data.spot.id : r.spot.id;
      const name = isOk ? r.data.spot.name : r.spot.name;
      const color = SPOT_PALETTE[idx % SPOT_PALETTE.length];

      if (!forecast) {
        return { id, name, isOk, color, hourly: [] };
      }

      const nowMs = forecast.current?.timestamp
        ? new Date(forecast.current.timestamp).getTime()
        : Date.now();
      const future = forecast.hourly.filter(
        (h) => new Date(h.timestamp).getTime() >= nowMs - 30 * 60 * 1000
      );
      const points = future.length > 0 ? future.slice(0, 48) : forecast.hourly.slice(0, 48);

      return { id, name, isOk, color, hourly: points };
    });
  }, [allSpotResults]);

  const totalPoints = useMemo(() => {
    return Math.max(0, ...seriesList.map((s) => s.hourly.length));
  }, [seriesList]);

  // Determine chart bounds
  const maxWind = useMemo(() => {
    let max = 30;
    for (const s of seriesList) {
      for (const h of s.hourly) {
        const val = dataMode === "local" ? h.localWind : h.modelWind;
        max = Math.max(max, val, h.localGust);
      }
    }
    return Math.ceil((max + 4) / 5) * 5;
  }, [seriesList, dataMode]);

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

  // Build SVG path strings dynamically for each series
  const paths = useMemo(() => {
    return seriesList.map((s) => {
      if (s.hourly.length === 0) return { ...s, path: "" };
      const path = s.hourly
        .map((item, idx) => {
          const val = dataMode === "local" ? item.localWind : item.modelWind;
          return `${idx === 0 ? "M" : "L"} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`;
        })
        .join(" ");
      return { ...s, path };
    });
  }, [seriesList, dataMode, maxWind, totalPoints]);

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
  const referenceList = useMemo(() => {
    const validSeries = seriesList.find((s) => s.hourly.length > 0);
    return validSeries ? validSeries.hourly : [];
  }, [seriesList]);

  const xTicks = useMemo(() => {
    const ticks: { index: number; label: string }[] = [];
    for (let i = 0; i < totalPoints; i += 6) {
      const item = referenceList[i];
      if (item) {
        ticks.push({ index: i, label: formatTimeHHMM(item.timestamp, timezone) });
      }
    }
    return ticks;
  }, [referenceList, totalPoints, timezone]);

  const handlePointerInteraction = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = clientX - rect.left;
    const svgX = (relX / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / chartWidth));
    const idx = Math.round(ratio * (totalPoints - 1));
    setHoverIndex(Math.max(0, Math.min(totalPoints - 1, idx)));
  };

  const activeTimeFormatted = useMemo(() => {
    if (hoverIndex === null || !referenceList[hoverIndex]) return "";
    const date = new Date(referenceList[hoverIndex].timestamp);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }, [hoverIndex, referenceList, timezone]);

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
              <span>WIND EVOLUTION & SPOT COMPARISON</span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive 48-hour wind evolution across all regional spots
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

        {/* Dynamic Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-3 px-1">
          <div className="flex items-center gap-4 flex-wrap">
            {seriesList.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block shadow-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-bold text-slate-200">
                  {s.name} {!s.isOk ? "(Offline)" : ""}
                </span>
              </div>
            ))}
          </div>

          <span className="text-[11px] text-sky-400 font-medium">
            Touch or move cursor to inspect any hour
          </span>
        </div>

        {/* SVG Interactive Chart */}
        <div className="relative w-full overflow-hidden cursor-crosshair">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none touch-none"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => handlePointerInteraction(e.clientX, e.currentTarget)}
            onPointerMove={(e) => handlePointerInteraction(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHoverIndex(null)}
            onPointerCancel={() => setHoverIndex(null)}
          >
            {/* Transparent backdrop overlay to capture all pointer events */}
            <rect x="0" y="0" width={width} height={height} fill="transparent" pointerEvents="all" />

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

            {/* Dynamic Spot Lines */}
            {paths.map((s) =>
              s.path ? (
                <path
                  key={s.id}
                  d={s.path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null
            )}

            {/* Active Hover Guide Line & Dots */}
            {hoverIndex !== null && (
              <g pointerEvents="none">
                <line
                  x1={getX(hoverIndex)}
                  y1={paddingTop}
                  x2={getX(hoverIndex)}
                  y2={height - paddingBottom}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />

                {seriesList.map((s) => {
                  const item = s.hourly[hoverIndex];
                  if (!item) return null;
                  const val = dataMode === "local" ? item.localWind : item.modelWind;
                  return (
                    <circle
                      key={s.id}
                      cx={getX(hoverIndex)}
                      cy={getY(val)}
                      r="5.5"
                      fill={s.color}
                      stroke="#0f172a"
                      strokeWidth="2.5"
                    />
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {/* Hover Tooltip Card */}
        {hoverIndex !== null && (
          <div className="mt-3 p-3 rounded-xl bg-surf-dark border border-surf-border flex flex-wrap items-center gap-3 text-xs animate-in fade-in duration-100">
            <div className="text-slate-400 flex items-center gap-2 border-b sm:border-b-0 pb-1 sm:pb-0 pr-2">
              <span>Time:</span>
              <strong className="text-white font-mono">{activeTimeFormatted}</strong>
            </div>

            {seriesList.map((s) => {
              const item = s.hourly[hoverIndex];
              if (!item) return null;
              const val = dataMode === "local" ? item.localWind : item.modelWind;
              return (
                <div key={s.id} className="flex items-center gap-1.5 pr-2">
                  <span className="flex items-center gap-1 font-bold" style={{ color: s.color }}>
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}:
                  </span>
                  <span className="font-mono text-white text-[11px]">
                    <strong>{Math.round(val)} kt</strong> {item.directionLabel} (Q:{item.sessionQualityScore})
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
