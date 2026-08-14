import React from "react";
import { Info, ShieldAlert, Cpu } from "lucide-react";

interface ForecastInfoProps {
  generatedAt?: string;
  model?: string;
}

export const ForecastInfo: React.FC<ForecastInfoProps> = ({
  generatedAt,
  model = "ECMWF IFS via Open-Meteo",
}) => {
  const formattedTime = generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Athens",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
        hour12: false,
      }).format(new Date(generatedAt))
    : "Recently";

  return (
    <footer className="w-full pt-4 pb-12 text-slate-400 text-xs border-t border-surf-border/60 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          <span>Forecast Source: <strong className="text-slate-200">{model}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <span>Updated: <strong className="text-slate-200">{formattedTime} (Athens)</strong></span>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-surf-card/60 border border-surf-border/60 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          <strong className="text-slate-300">Methodology & Disclaimer:</strong> Numerical forecasts use ECMWF IFS model data enhanced by spot-specific empirical terrain, thermal, and orographic transformation curves. When open-data weather station observations (e.g. Meteotrentino, SIR Toscana, ARPA Lombardia, MeteoSwiss) are available, SpotPilot performs real-time observation fusion to validate local onset, adjust speed bias, and enhance forecast confidence.
        </p>
      </div>
    </footer>
  );
};
