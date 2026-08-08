import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        wind: {
          low: "#64748b",      // slate
          light: "#38bdf8",    // light sky blue
          good: "#22c55e",     // emerald green
          great: "#06b6d4",    // cyan
          strong: "#f59e0b",   // amber
          veryStrong: "#ef4444"// red
        },
        surf: {
          dark: "#0a0f1d",
          card: "#131b2e",
          cardHover: "#1c263f",
          border: "#23304e",
          accent: "#38bdf8",
          accentGlow: "rgba(56, 189, 248, 0.15)",
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
