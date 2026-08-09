import {
  DailyWindSummary,
  HourlyWind,
  Recommendation,
  SpotForecast,
} from "@/types/weather";
import { getDominantDirection } from "./windDirection";
import { findBestWindow } from "./bestWindow";
import { getConditionLabel } from "./windScore";
import { getAthensTimeComponents } from "./localWind";
import { SCORING_CONFIG } from "@/config/windProfiles";

/**
 * Extracts Athens YYYY-MM-DD date key from a UTC ISO timestamp or Date.
 */
export function getAthensDateKey(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    const str = typeof timestamp === "string" ? timestamp : timestamp.toISOString();
    return str.slice(0, 10);
  }
}

/**
 * Groups hourly forecast items by Athens local calendar date and computes daily summaries.
 */
export function calculateDailySummaries(hourlyItems: HourlyWind[]): DailyWindSummary[] {
  const groups = new Map<string, HourlyWind[]>();

  for (const item of hourlyItems) {
    const dateKey = getAthensDateKey(item.timestamp);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(item);
  }

  const summaries: DailyWindSummary[] = [];

  for (const [date, items] of groups.entries()) {
    // Filter daytime items (09:00 - 20:00 Athens local time)
    const daytimeItems = items.filter((item) => {
      const { hour } = getAthensTimeComponents(item.timestamp);
      return (
        hour >= SCORING_CONFIG.daytime.startHour &&
        hour <= SCORING_CONFIG.daytime.endHour
      );
    });

    const evalItems = daytimeItems.length > 0 ? daytimeItems : items;

    // Daily spot score: average of the 3 highest hourly scores in the daytime period
    const sortedScores = evalItems.map((i) => i.score).sort((a, b) => b - a);
    const top3Scores = sortedScores.slice(0, 3);
    const dailyScore =
      top3Scores.length > 0
        ? Math.round(top3Scores.reduce((a, b) => a + b, 0) / top3Scores.length)
        : 0;

    // 24h Full Day Wind Range
    const fullDayWindValues = items.map((i) => Math.round(i.localWind));
    const minWind = Math.min(...fullDayWindValues);
    const maxWind = Math.max(...fullDayWindValues);

    // Daytime 09:00 - 20:00 Wind Range (priority for windsurfing)
    const daytimeWindValues = evalItems.map((i) => Math.round(i.localWind));
    const daytimeMinWind = Math.min(...daytimeWindValues);
    const daytimeMaxWind = Math.max(...daytimeWindValues);

    // Maximum Gust
    const maxGust = Math.round(Math.max(...items.map((i) => i.localGust)));

    // Vector circular dominant direction over daytime period
    const directionDegreesList = evalItems.map((i) => i.directionDegrees);
    const { degrees: dominantDirectionDegrees, label: dominantDirection } =
      getDominantDirection(directionDegreesList);

    // Best continuous windsurfing window (>=70 score, >=2 hours)
    const bestWindow = findBestWindow(
      evalItems,
      SCORING_CONFIG.bestWindow.minScoreThreshold,
      SCORING_CONFIG.bestWindow.minConsecutiveHours
    );

    summaries.push({
      date,
      minWind,
      maxWind,
      daytimeMinWind,
      daytimeMaxWind,
      maxGust,
      dominantDirection,
      dominantDirectionDegrees,
      bestWindow,
      score: dailyScore,
      condition: getConditionLabel(dailyScore),
    });
  }

  // Sort chronologically by calendar date
  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Evaluates available spot forecasts to produce the overall recommendation for "today" in Athens.
 * Explicitly matches the Athens calendar date rather than assuming index 0.
 */
export function calculateBestSpotRecommendation(
  kouremenosForecast: SpotForecast | null,
  tendaForecast: SpotForecast | null,
  referenceDate = new Date()
): Recommendation {
  const todayAthensKey = getAthensDateKey(referenceDate);

  const kToday = kouremenosForecast?.days.find((d) => d.date === todayAthensKey) ?? kouremenosForecast?.days[0];
  const tToday = tendaForecast?.days.find((d) => d.date === todayAthensKey) ?? tendaForecast?.days[0];

  const kScore = kToday?.score ?? (kouremenosForecast ? 0 : null);
  const tScore = tToday?.score ?? (tendaForecast ? 0 : null);

  if (kScore === null && tScore === null) {
    return {
      bestSpot: null,
      bestSpotName: null,
      bestWindow: null,
      score: null,
      dayScoreKouremenos: null,
      dayScoreTenda: null,
    };
  }

  const kSafe = kScore ?? -1;
  const tSafe = tScore ?? -1;

  if (kSafe <= 0 && tSafe <= 0) {
    const defaultSpot = kouremenosForecast ? "kouremenos" : "tenda";
    const defaultName = kouremenosForecast ? "Kouremenos" : "Tenda";
    return {
      bestSpot: defaultSpot,
      bestSpotName: defaultName,
      bestWindow: null,
      score: 0,
      dayScoreKouremenos: kScore,
      dayScoreTenda: tScore,
    };
  }

  const isKouremenosBest = kSafe >= tSafe;
  const bestSpot = isKouremenosBest ? "kouremenos" : "tenda";
  const bestSpotName = isKouremenosBest ? "Kouremenos" : "Tenda";
  const chosenTodaySummary = isKouremenosBest ? kToday : tToday;
  const chosenScore = isKouremenosBest ? kScore : tScore;

  const bestWindow = chosenTodaySummary?.bestWindow ?? null;

  return {
    bestSpot,
    bestSpotName,
    bestWindow,
    score: chosenScore,
    dayScoreKouremenos: kScore,
    dayScoreTenda: tScore,
  };
}
