import { BestWindow, HourlyWind, WaterState } from "@/types/weather";
import { getConditionLabel } from "./windScore";
import { getDominantDirection } from "./windDirection";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { calculateWindowStability } from "./windowStability";
import { getSolarWindow, isSpotOperatingHour } from "./solar";
import { OperatingWindow } from "@/types/region";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Formats an ISO UTC timestamp string to HH:MM in Europe/Athens timezone.
 */
export function formatTimeHHMM(timestamp: string, timezone = "Europe/Athens"): string {
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return timestamp.slice(11, 16) || "00:00";
  }
}

/**
 * Finds the optimal windsurfing window within a given list of hourly forecast items.
 * Evaluates continuous blocks where:
 * 1. sessionQualityScore >= minScoreThreshold (default 70)
 * 2. eligibility !== "UNSUITABLE" (hard gate: unsuitable hours cannot be in best window)
 * 3. duration >= minDuration (default 2 consecutive hours)
 * 4. adjacent items are strictly 1 hour apart
 * 5. Window is strictly within spot operating/solar hours
 */
export function findBestWindow(
  hourlyItems: HourlyWind[],
  minScoreThreshold = 70,
  minConsecutiveHours = 2,
  timezone = "Europe/Athens",
  latitude = 35.19,
  longitude = 26.27,
  operatingWindow?: OperatingWindow
): BestWindow | null {
  if (!hourlyItems || hourlyItems.length === 0) return null;

  // Filter strictly to spot operating hours / astronomical daylight
  const daylightItems = hourlyItems.filter((item) => {
    return isSpotOperatingHour(
      item.timestamp,
      { latitude, longitude, operatingWindow },
      timezone
    );
  });

  if (daylightItems.length === 0) return null;

  const candidateSequences: HourlyWind[][] = [];
  let currentSequence: HourlyWind[] = [];

  for (let i = 0; i < daylightItems.length; i++) {
    const item = daylightItems[i];
    const isQualifying =
      item.sessionQualityScore >= minScoreThreshold &&
      item.eligibility !== "UNSUITABLE";

    if (isQualifying) {
      if (currentSequence.length > 0) {
        const prevItem = currentSequence[currentSequence.length - 1];
        const prevMs = new Date(prevItem.timestamp).getTime();
        const currMs = new Date(item.timestamp).getTime();

        const diffMs = currMs - prevMs;
        const isConsecutive = Math.abs(diffMs - ONE_HOUR_MS) <= 120000;

        if (!isConsecutive) {
          if (currentSequence.length >= minConsecutiveHours) {
            candidateSequences.push([...currentSequence]);
          }
          currentSequence = [item];
          continue;
        }
      }

      currentSequence.push(item);
    } else {
      if (currentSequence.length >= minConsecutiveHours) {
        candidateSequences.push([...currentSequence]);
      }
      currentSequence = [];
    }
  }

  if (currentSequence.length >= minConsecutiveHours) {
    candidateSequences.push([...currentSequence]);
  }

  if (candidateSequences.length === 0) return null;

  // Evaluate candidate sequences
  interface EvaluatedSequence {
    sequence: HourlyWind[];
    meanScore: number;
    durationHours: number;
    minScore: number;
    startIndex: number;
  }

  const evaluated: EvaluatedSequence[] = candidateSequences.map((seq) => {
    const sumScore = seq.reduce((acc, h) => acc + h.sessionQualityScore, 0);
    const meanScore = sumScore / seq.length;
    const minScore = Math.min(...seq.map((h) => h.sessionQualityScore));
    const startIndex = daylightItems.indexOf(seq[0]);
    return {
      sequence: seq,
      meanScore,
      durationHours: seq.length,
      minScore,
      startIndex,
    };
  });

  // Sort by highest meanScore, then longer duration, then higher minScore, then earlier startIndex
  evaluated.sort((a, b) => {
    const scoreDiff = b.meanScore - a.meanScore;
    if (Math.abs(scoreDiff) > 0.5) {
      return scoreDiff;
    }
    if (b.durationHours !== a.durationHours) {
      return b.durationHours - a.durationHours;
    }
    if (b.minScore !== a.minScore) {
      return b.minScore - a.minScore;
    }
    return a.startIndex - b.startIndex;
  });

  const best = evaluated[0];
  const seq = best.sequence;
  const startItem = seq[0];
  const lastItem = seq[seq.length - 1];

  const startTimeStr = formatTimeHHMM(startItem.timestamp, timezone);

  let endTimeStr = "";
  try {
    const lastDate = new Date(lastItem.timestamp);
    const endDate = new Date(lastDate.getTime() + ONE_HOUR_MS);
    const endHourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(endDate);
    const endHour = parseInt(endHourStr, 10);

    // Astronomical Sunset limit: clamp to sunset
    const solar = getSolarWindow(lastItem.timestamp, latitude, longitude, timezone);
    const sunsetHour = solar.endHour;
    if (endHour > sunsetHour || endHour === 0) {
      endTimeStr = `${String(sunsetHour).padStart(2, "0")}:00`;
    } else {
      endTimeStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(endDate);
    }
  } catch {
    endTimeStr = formatTimeHHMM(lastItem.timestamp, timezone);
  }

  // Safety check: ensure endTime is strictly after startTime
  const startHourVal = parseInt(startTimeStr.split(":")[0], 10);
  let endHourVal = parseInt(endTimeStr.split(":")[0], 10);
  if (endHourVal <= startHourVal) {
    endHourVal = Math.min(20, startHourVal + best.durationHours);
    endTimeStr = `${String(endHourVal).padStart(2, "0")}:00`;
  }

  const windValues = seq.map((h) => Math.round(h.localWind));
  const minWind = Math.min(...windValues);
  const maxWind = Math.max(...windValues);

  const directionDegrees = seq.map((h) => h.directionDegrees);
  const dominantDir = getDominantDirection(directionDegrees);

  // Dominant sailing style during window
  const stylesCount: Record<WaterState, number> = {
    WAVE: 0,
    BUMP_AND_JUMP: 0,
    CHOP: 0,
    FLAT: 0,
  };
  seq.forEach((h) => {
    stylesCount[h.waterState] = (stylesCount[h.waterState] || 0) + 1;
  });
  const dominantStyle = (Object.keys(stylesCount) as WaterState[]).reduce((a, b) =>
    stylesCount[a] >= stylesCount[b] ? a : b
  );

  const roundedMeanScore = Math.round(best.meanScore);
  const stability = calculateWindowStability(seq);

  return {
    start: startTimeStr,
    end: endTimeStr,
    startIso: startItem.timestamp,
    endIso: lastItem.timestamp,
    durationHours: best.durationHours,
    minWind,
    maxWind,
    dominantDirection: dominantDir.label,
    dominantDirectionDegrees: dominantDir.degrees,
    score: roundedMeanScore,
    meanScore: roundedMeanScore,
    classification: getConditionLabel(roundedMeanScore),
    sailingStyle: dominantStyle,
    stability,
  };
}
