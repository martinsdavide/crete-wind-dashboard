# SpotPilot 🏄‍♂️🧭

**SpotPilot — Find your best windsurf session.**

A lightweight, high-performance, mobile-first web application providing spot-calibrated windsurfing session quality forecasts and intelligent spot recommendations for Eastern Crete:
1. **Kouremenos (Palekastro)**
2. **Tenda (Cape Sidero)**
3. **Xerokampos (South-East Crete)**

Built with Next.js 15, TypeScript (strict mode), Tailwind CSS, and Open-Meteo (ECMWF IFS HRES).

---

## Key Features

- **Session Quality Recommendation Engine (v2)**: Answers *"Where should I windsurf today, and when?"* by evaluating spot suitability, sailing style (Wave, Bump & Jump, Flat water), non-monotonic wind curves, gustiness, and continuous prime windows ($\ge 70$ session score).
- **Core Forecast & Regional Flow**: ECMWF IFS HRES integration, 4-day hourly forecast in Europe/Athens timezone, true regional synoptic flow detection (Meltemi / Westerly / Southerly).
- **Dual Theme Support**:
  - **Deep Surf (Dark Theme)**: Ocean navy visual aesthetic.
  - **Aegean Daylight (Light Theme)**: High-contrast, sunlight-optimized outdoor beach mode with persistent toggle.
- **Spot-Specific Local Wind Corrections**:
  - **Kouremenos**: Directional acceleration, diurnal thermal sweetspot, and non-monotonic quality curve.
  - **Tenda**: Cape Sidero wave and Meltemi preference boost.
  - **Xerokampos**: South-East alternative regime for W/SW and southerly flows.
- **Visual Comparison & Interactive Chart**: 48-hour comparison chart with **Local Estimate vs Raw Model** toggle.
- **Full PWA Support**: Installable on iOS/Android Home Screen with official SpotPilot icons.

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js 22+)
- npm or yarn

### Installation & Local Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running Tests

Run the complete Vitest automated test suite:

```bash
npm test
```

Build for production:

```bash
npm run build
```

---

## Architecture & Data Flow

```
Open-Meteo API (ECMWF IFS HRES)
          │
          ▼
Weather Provider (`/lib/weather/openMeteo.ts`)
          │
          ▼
Weather Normalization (`/lib/weather/normalizeForecast.ts`)
          │
          ▼
Spot Quality Selection Engine (`/lib/sessionQuality.ts`, `/lib/spotEligibility.ts`)
          │
          ▼
Daily & Best-Window Analysis (`/lib/dailySummary.ts`, `/lib/bestWindow.ts`)
          │
          ▼
Next.js API Route (`/app/api/wind/route.ts` with 15-min revalidation)
          │
          ▼
Mobile-First UI Dashboard (`/app/page.tsx` + `components/SpotPilotLogo.tsx`)
```

---

## License
MIT
