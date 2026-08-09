import React from "react";
import Image from "next/image";

export interface SpotPilotLogoProps {
  variant?: "full" | "mark";
  size?: "small" | "medium" | "large";
  showTagline?: boolean;
  className?: string;
  alt?: string;
}

export const SpotPilotLogo: React.FC<SpotPilotLogoProps> = ({
  variant = "mark",
  size = "medium",
  showTagline = false,
  className = "",
  alt = "SpotPilot",
}) => {
  // Dimensions for variant & size combinations
  const dimensions = {
    mark: {
      small: { width: 32, height: 30, className: "w-8 h-[30px]" },
      medium: { width: 42, height: 40, className: "w-10 h-[38px]" },
      large: { width: 64, height: 60, className: "w-16 h-[60px]" },
    },
    full: {
      small: { width: 130, height: 98, className: "w-32 h-auto" },
      medium: { width: 180, height: 136, className: "w-44 h-auto" },
      large: { width: 240, height: 182, className: "w-60 h-auto" },
    },
  };

  const currentDim = dimensions[variant][size];

  const lightSrc =
    variant === "mark"
      ? "/branding/spotpilot-mark-light.png"
      : "/branding/spotpilot-light.png";

  const darkSrc =
    variant === "mark"
      ? "/branding/spotpilot-mark-dark.png"
      : "/branding/spotpilot-dark.png";

  return (
    <div className={`relative inline-flex items-center select-none ${className}`}>
      {/* Light Theme Logo (shown in daylight mode) */}
      <img
        src={lightSrc}
        alt={alt}
        width={currentDim.width}
        height={currentDim.height}
        className={`object-contain transition-opacity duration-200 hidden [html[data-theme="daylight"]_&]:block [html:not([data-theme="dark"]):not(.dark)_&]:block ${currentDim.className}`}
        loading="eager"
      />

      {/* Dark Theme Logo (shown in dark mode) */}
      <img
        src={darkSrc}
        alt={alt}
        width={currentDim.width}
        height={currentDim.height}
        className={`object-contain transition-opacity duration-200 block [html[data-theme="daylight"]_&]:hidden [html:not([data-theme="dark"]):not(.dark)_&]:hidden ${currentDim.className}`}
        loading="eager"
      />
    </div>
  );
};
