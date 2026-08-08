# Crete Wind Dashboard 🏄‍♂️💨

A lightweight, mobile-first web application providing spot-calibrated windsurfing forecasts for eastern Crete:
1. **Kouremenos (Palekastro)**
2. **Tenda (Cape Sidero)**

Built with Next.js 15, TypeScript (strict mode), Tailwind CSS, and Open-Meteo (ECMWF IFS).

---

## Key Features

- **P0 Core Forecast**: Open-Meteo / ECMWF IFS integration, 4-day hourly forecast in Europe/Athens timezone, linear interpolation for current `NOW` conditions.
- **P1 Local Wind Corrections & Scoring**:
  - **Kouremenos**: Spot-specific direction factors, diurnal thermal profile (15 May–30 Sept), cloud cover attenuation, and clamping [0.90, 1.45].
  - **Tenda**: Conservative direction factor acceleration (max 1.20).
  - **Local Gust Calculation**: `localGust = modelGust + (localWind - modelWind) * 0.60` (guaranteeing $localGust \ge localWind$).
  - **Windsurfing Score (0–100)**: Multi-factor scoring (55% strength, 25% direction, 10% gustiness, 10% confidence).
  - **Best Spot & Best Window**: Automatically answers *"Where should I windsurf today, and when?"* during the 09:00–20:00 Greek daytime period.
- **P2 Visual Comparison & PWA**:
  - Interactive 48-hour comparison chart with **Local Estimate vs Raw Model** toggle.
  - Forecast confidence badges (HIGH / MEDIUM / LOW).
  - Full PWA support with standalone display and icons for iPhone Home Screen.

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
Open-Meteo API (ECMWF IFS)
          │
          ▼
Weather Provider (`/lib/weather/openMeteo.ts`)
          │
          ▼
Weather Normalization (`/lib/weather/normalizeForecast.ts`)
          │
          ▼
Local Wind Correction Engine (`/lib/localWind.ts`)
          │
          ▼
Windsurfing Scoring Engine (`/lib/windScore.ts`)
          │
          ▼
Daily & Best-Window Analysis (`/lib/dailySummary.ts`, `/lib/bestWindow.ts`)
          │
          ▼
Next.js API Route (`/app/api/wind/route.ts` with 15-min revalidation)
          │
          ▼
Mobile-First UI Dashboard (`/app/page.tsx` + Components)
```

---

## License
MIT
