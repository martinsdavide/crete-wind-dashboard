import { BestWindow, HourlyWind } from "@/types/weather";
import { getConditionLabel } from "./windScore";
import { getDominantDirection } from "./windDirection";

/**
 * Formats an ISO or timestamp string to HH:MM in Europe/Athens timezone.
 */
export function formatTimeHHMM(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
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
 * Evaluates continuous blocks where score >= minScoreThreshold (default 70) and duration >= minDuration (default 2).
 */
export function findBestWindow(
  hourlyItems: HourlyWind[],
  minScoreThreshold = 70,
  minConsecutiveHours = 2
): BestWindow | null {
  if (!hourlyItems || hourlyItems.length === 0) return null;

  const candidateSequences: HourlyWind[][] = [];
  let currentSequence: HourlyWind[] = [];

  for (const item of hourlyItems) {
    if (item.score >= minScoreThreshold) {
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
    const sumScore = seq.reduce((acc, h) => acc + h.score, 0);
    const meanScore = sumScore / seq.length;
    const minScore = Math.min(...seq.map((h) => h.score));
    const startIndex = hourlyItems.indexOf(seq[0]);
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

  const startTimeStr = formatTimeHHMM(startItem.timestamp);
  
  // For end time: calculate end of the window (add 1 hour to the start of last item if desired, or display last hour)
  // E.g., if seq is 14:00, 15:00, 16:00, 17:00 -> window is 14:00 - 18:00
  let endTimeStr = "";
  try {
    const lastDate = new Date(lastItem.timestamp);
    const endDate = new Date(lastDate.getTime() + 60 * 60 * 1000);
    endTimeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(endDate);
  } catch {
    endTimeStr = formatTimeHHMM(lastItem.timestamp);
  }

  const windValues = seq.map((h) => Math.round(h.localWind));
  const minWind = Math.min(...windValues);
  const maxWind = Math.max(...windValues);

  const directionDegrees = seq.map((h) => h.directionDegrees);
  const dominantDir = getDominantDirection(directionDegrees);

  const roundedMeanScore = Math.round(best.meanScore);

  return {
    start: startTimeStr,
    end: endTimeStr,
    startIso: startItem.timestamp,
    endIso: lastItem.timestamp,
    durationHours: best.durationHours,
    minWind,
    maxWind,
    dominantDirection: dominantDir.label,
    meanScore: roundedMeanScore,
    condition: getConditionLabel(roundedMeanScore),
  };
}
