import {
  DailyWindSummary,
  HourlyWind,
  Recommendation,
  SpotEligibility,
  SpotForecast,
  WaterState,
} from "@/types/weather";
import { SpotId } from "@/types/spot";
import { getDominantDirection } from "./windDirection";
import { findBestWindow } from "./bestWindow";
import { getConditionLabel } from "./windScore";
import { getAthensTimeComponents } from "./localWind";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { calculateRegionalReferenceFlow } from "./windRegime";
import { explainRecommendation } from "./sessionQuality";

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

    // Daily spot score: average of the 3 highest ELIGIBLE hourly sessionQualityScores in daytime period
    const eligibleScores = evalItems
      .filter((i) => i.eligibility !== "UNSUITABLE")
      .map((i) => i.sessionQualityScore)
      .sort((a, b) => b - a);

    const top3Scores = eligibleScores.slice(0, 3);
    const dailyScore =
      top3Scores.length > 0
        ? Math.round(top3Scores.reduce((a, b) => a + b, 0) / top3Scores.length)
        : 0;

    // 24h Full Day Wind Range
    const fullDayWindValues = items.map((i) => Math.round(i.localWind));
    const minWind = Math.min(...fullDayWindValues);
    const maxWind = Math.max(...fullDayWindValues);

    // Daytime 09:00 - 20:00 Wind Range
    const daytimeWindValues = evalItems.map((i) => Math.round(i.localWind));
    const daytimeMinWind = Math.min(...daytimeWindValues);
    const daytimeMaxWind = Math.max(...daytimeWindValues);

    // Maximum Gust
    const maxGust = Math.round(Math.max(...items.map((i) => i.localGust)));

    // Vector circular dominant direction over daytime period
    const directionDegreesList = evalItems.map((i) => i.directionDegrees);
    const { degrees: dominantDirectionDegrees, label: dominantDirection } =
      getDominantDirection(directionDegreesList);

    // Dominant eligibility & style (for UI display purposes only, NOT a hard gate)
    const eligCount: Record<SpotEligibility, number> = {
      IDEAL: 0,
      SUITABLE: 0,
      MARGINAL: 0,
      UNSUITABLE: 0,
    };
    const styleCount: Record<WaterState, number> = {
      WAVE: 0,
      BUMP_AND_JUMP: 0,
      CHOP: 0,
      FLAT: 0,
    };

    evalItems.forEach((i) => {
      eligCount[i.eligibility] = (eligCount[i.eligibility] || 0) + 1;
      styleCount[i.waterState] = (styleCount[i.waterState] || 0) + 1;
    });

    const dominantEligibility = (Object.keys(eligCount) as SpotEligibility[]).reduce((a, b) =>
      eligCount[a] >= eligCount[b] ? a : b
    );
    const dominantStyle = (Object.keys(styleCount) as WaterState[]).reduce((a, b) =>
      styleCount[a] >= styleCount[b] ? a : b
    );

    // Best continuous windsurfing window (>=70 session score, >=2 hours, no unsuitable hours)
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
      dominantEligibility,
      dominantStyle,
    });
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Checks if a spot has sufficient valid daytime hours to qualify as a candidate.
 */
function isSpotEligibleCandidate(
  forecast: SpotForecast | null,
  summary: DailyWindSummary | null,
  dateKey: string
): boolean {
  if (!forecast || !summary) return false;

  // 1. If a valid Best Window exists (>=70 session score for >=2 consecutive eligible hours), it's eligible!
  if (summary.bestWindow && summary.bestWindow.meanScore >= 70) {
    return true;
  }

  // 2. Alternatively, check if there are >= 2 daytime eligible hours with score >= 60
  const dayItems = forecast.hourly.filter((h) => {
    const isTargetDate = getAthensDateKey(h.timestamp) === dateKey;
    const { hour } = getAthensTimeComponents(h.timestamp);
    const isDaytime =
      hour >= SCORING_CONFIG.daytime.startHour &&
      hour <= SCORING_CONFIG.daytime.endHour;
    return isTargetDate && isDaytime;
  });

  const eligibleHours = dayItems.filter(
    (h) => h.eligibility !== "UNSUITABLE" && h.sessionQualityScore >= 60
  );

  return eligibleHours.length >= 2 && summary.score >= 60;
}

/**
 * Evaluates all available spot forecasts to produce the overall session quality recommendation for today.
 * Supports 3 spots: Kouremenos, Tenda, Xerokampos.
 */
export function calculateBestSpotRecommendation(
  kouremenosForecast: SpotForecast | null,
  tendaForecast: SpotForecast | null,
  xerokamposForecast: SpotForecast | null = null,
  referenceDate = new Date()
): Recommendation {
  const todayAthensKey = getAthensDateKey(referenceDate);

  const kToday = kouremenosForecast?.days?.find((d) => d.date === todayAthensKey) ?? kouremenosForecast?.days?.[0] ?? null;
  const tToday = tendaForecast?.days?.find((d) => d.date === todayAthensKey) ?? tendaForecast?.days?.[0] ?? null;
  const xToday = xerokamposForecast?.days?.find((d) => d.date === todayAthensKey) ?? xerokamposForecast?.days?.[0] ?? null;

  const kScore = kToday ? kToday.score : null;
  const tScore = tToday ? tToday.score : null;
  const xScore = xToday ? xToday.score : null;

  // True regional synoptic flow (derived from uncorrected Kouremenos + Tenda model wind & direction)
  const kModelWind = kouremenosForecast?.current?.modelWind ?? null;
  const kModelDir = kouremenosForecast?.current?.directionDegrees ?? null;
  const tModelWind = tendaForecast?.current?.modelWind ?? null;
  const tModelDir = tendaForecast?.current?.directionDegrees ?? null;

  const { regime, label: regimeLabel } = calculateRegionalReferenceFlow(
    kModelWind,
    kModelDir,
    tModelWind,
    tModelDir,
    xerokamposForecast?.current?.modelWind ?? 0,
    xerokamposForecast?.current?.directionDegrees ?? 315
  );

  const candidates: {
    spotId: SpotId;
    name: string;
    score: number;
    todaySummary: DailyWindSummary;
    forecast: SpotForecast;
  }[] = [];

  if (isSpotEligibleCandidate(kouremenosForecast, kToday, todayAthensKey)) {
    candidates.push({
      spotId: "kouremenos",
      name: "Kouremenos",
      score: kToday!.score,
      todaySummary: kToday!,
      forecast: kouremenosForecast!,
    });
  }

  if (isSpotEligibleCandidate(tendaForecast, tToday, todayAthensKey)) {
    candidates.push({
      spotId: "tenda",
      name: "Tenda",
      score: tToday!.score,
      todaySummary: tToday!,
      forecast: tendaForecast!,
    });
  }

  if (isSpotEligibleCandidate(xerokamposForecast, xToday, todayAthensKey)) {
    candidates.push({
      spotId: "xerokampos",
      name: "Xerokampos",
      score: xToday!.score,
      todaySummary: xToday!,
      forecast: xerokamposForecast!,
    });
  }

  // If no candidate spot meets window or session eligibility criteria, return bestSpot: null
  if (candidates.length === 0) {
    const explanation = explainRecommendation(null, regime, {
      kToday,
      tToday,
      xToday,
    });

    return {
      bestSpot: null,
      bestSpotName: null,
      bestWindow: null,
      score: 0,
      dayScoreKouremenos: kScore,
      dayScoreTenda: tScore,
      dayScoreXerokampos: xScore,
      regime,
      regimeLabel,
      sailingStyle: "FLAT",
      explanation,
    };
  }

  // Sort candidate spots by highest dailySessionQualityScore
  candidates.sort((a, b) => b.score - a.score);

  const winner = candidates[0];
  const bestWindow = winner.todaySummary.bestWindow ?? null;
  const sailingStyle =
    bestWindow?.sailingStyle || winner.todaySummary.dominantStyle || "BUMP_AND_JUMP";

  const explanation = explainRecommendation(winner.spotId, regime, {
    kToday,
    tToday,
    xToday,
  });

  return {
    bestSpot: winner.spotId,
    bestSpotName: winner.name,
    bestWindow,
    score: winner.score,
    dayScoreKouremenos: kScore,
    dayScoreTenda: tScore,
    dayScoreXerokampos: xScore,
    regime,
    regimeLabel,
    sailingStyle,
    explanation,
  };
}
