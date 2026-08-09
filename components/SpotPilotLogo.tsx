import React from "react";

export interface SpotPilotLogoProps {
  variant?: "full" | "mark";
  size?: "small" | "medium" | "large" | "responsive-header";
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
      large: { width: 80, height: 76, className: "w-20 h-[76px]" },
      "responsive-header": {
        width: 80,
        height: 76,
        // ~38px on mobile, doubled to ~76-85px on desktop PC screens!
        className: "w-10 h-[38px] md:w-20 md:h-[76px] lg:w-22 lg:h-[84px]",
      },
    },
    full: {
      small: { width: 130, height: 98, className: "w-32 h-auto" },
      medium: { width: 180, height: 136, className: "w-44 h-auto" },
      large: { width: 280, height: 212, className: "w-72 h-auto" },
      "responsive-header": {
        width: 280,
        height: 212,
        className: "w-36 h-auto md:w-72 md:h-auto",
      },
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
      {/* Light Theme Logo (shown in daylight mode, transparent background) */}
      <img
        src={lightSrc}
        alt={alt}
        width={currentDim.width}
        height={currentDim.height}
        className={`object-contain transition-all duration-200 hidden [html[data-theme="daylight"]_&]:block [html:not([data-theme="dark"]):not(.dark)_&]:block ${currentDim.className}`}
        loading="eager"
      />

      {/* Dark Theme Logo (shown in dark mode, transparent background) */}
      <img
        src={darkSrc}
        alt={alt}
        width={currentDim.width}
        height={currentDim.height}
        className={`object-contain transition-all duration-200 block [html[data-theme="daylight"]_&]:hidden [html:not([data-theme="dark"]):not(.dark)_&]:hidden ${currentDim.className}`}
        loading="eager"
      />
    </div>
  );
};
