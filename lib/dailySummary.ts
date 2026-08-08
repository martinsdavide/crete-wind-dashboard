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
 * Extracts Athens YYYY-MM-DD date string from timestamp.
 */
export function getAthensDateKey(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return timestamp.slice(0, 10);
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
    // Filter daytime items (09:00 - 20:00)
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

    // Wind ranges and gusts
    const windValues = items.map((i) => Math.round(i.localWind));
    const minWind = Math.min(...windValues);
    const maxWind = Math.max(...windValues);
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
      maxGust,
      dominantDirection,
      dominantDirectionDegrees,
      bestWindow,
      score: dailyScore,
      condition: getConditionLabel(dailyScore),
    });
  }

  // Sort chronologically
  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Evaluates both spots to produce the overall recommendation for today.
 */
export function calculateBestSpotRecommendation(
  kouremenosForecast: SpotForecast,
  tendaForecast: SpotForecast
): Recommendation {
  const kToday = kouremenosForecast.days[0];
  const tToday = tendaForecast.days[0];

  const kScore = kToday?.score ?? 0;
  const tScore = tToday?.score ?? 0;

  if (kScore === 0 && tScore === 0) {
    return {
      bestSpot: null,
      bestSpotName: null,
      bestWindow: null,
      score: null,
      dayScoreKouremenos: kScore,
      dayScoreTenda: tScore,
    };
  }

  // Select spot with highest daily score
  const isKouremenosBest = kScore >= tScore;
  const bestSpot = isKouremenosBest ? "kouremenos" : "tenda";
  const bestSpotName = isKouremenosBest ? "Kouremenos" : "Tenda";
  const bestForecast = isKouremenosBest ? kouremenosForecast : tendaForecast;
  const chosenScore = isKouremenosBest ? kScore : tScore;

  const bestWindow = bestForecast.days[0]?.bestWindow ?? null;

  return {
    bestSpot,
    bestSpotName,
    bestWindow,
    score: chosenScore,
    dayScoreKouremenos: kScore,
    dayScoreTenda: tScore,
  };
}
