"use client";

import React from "react";
import { WindDirection } from "@/types/weather";

interface WindArrowProps {
  rotation: number; // degrees wind blows TO (0-359)
  directionLabel?: WindDirection;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const WindArrow: React.FC<WindArrowProps> = ({
  rotation,
  directionLabel,
  size = "md",
  className = "",
}) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-11 h-11",
  };

  return (
    <div
      className={`inline-flex items-center justify-center transition-transform duration-300 ${className}`}
      title={`Wind blowing towards ${Math.round(rotation)}° (${directionLabel ? `from ${directionLabel}` : ""})`}
      aria-label={`Wind blowing towards ${Math.round(rotation)}°`}
    >
      <svg
        className={`${sizeClasses[size]} drop-shadow-sm`}
        style={{ transform: `rotate(${rotation}deg)` }}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="11" className="fill-surf-card/80 stroke-surf-border" strokeWidth="1.5" />
        <path
          d="M12 4L16.5 15L12 13L7.5 15L12 4Z"
          className="fill-sky-400 stroke-sky-300"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="1.5" className="fill-sky-100" />
      </svg>
    </div>
  );
};
