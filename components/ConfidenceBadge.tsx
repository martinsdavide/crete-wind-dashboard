import React from "react";
import { ForecastConfidenceLevel } from "@/types/weather";

interface ConfidenceBadgeProps {
  level: ForecastConfidenceLevel;
  confidence?: number;
  className?: string;
  showPercent?: boolean;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  level,
  confidence,
  className = "",
  showPercent = false,
}) => {
  const styles = {
    HIGH: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    LOW: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };

  const dots = {
    HIGH: "bg-emerald-400",
    MEDIUM: "bg-amber-400",
    LOW: "bg-rose-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[level]} ${className}`}
      title={`Forecast Confidence: ${level}${confidence !== undefined ? ` (${confidence}%)` : ""}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dots[level]}`} />
      <span>Confidence {level}</span>
      {showPercent && confidence !== undefined && (
        <span className="opacity-75 font-normal">({confidence}%)</span>
      )}
    </span>
  );
};
