import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
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
          dark: "var(--surf-dark)",
          card: "var(--surf-card)",
          cardHover: "var(--surf-card-hover)",
          border: "var(--surf-border)",
          accent: "var(--surf-accent)",
        },
        theme: {
          text: "var(--theme-text)",
          muted: "var(--theme-muted)",
          sub: "var(--theme-sub)",
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
