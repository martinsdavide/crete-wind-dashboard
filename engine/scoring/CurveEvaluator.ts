import { QualityPoint } from "@/types/region";

/**
 * Evaluates any non-monotonic piecewise linear quality curve (Point(wind, score)).
 * Performs linear interpolation between defined anchor points and linear extrapolation at the boundaries.
 */
export function evaluateQualityCurve(curve: QualityPoint[], wind: number): number {
  if (!curve || curve.length === 0) return 0;
  const safeWind = Math.max(0, isNaN(wind) ? 0 : wind);

  // Below first defined point: linear ramp-up from 0
  if (safeWind <= curve[0].wind) {
    if (curve[0].wind === 0) return curve[0].score;
    return (safeWind / curve[0].wind) * curve[0].score;
  }

  // Above last defined point: progressive degradation penalty
  const lastPoint = curve[curve.length - 1];
  if (safeWind >= lastPoint.wind) {
    return Math.max(0, lastPoint.score - (safeWind - lastPoint.wind) * 2.0);
  }

  // Intermediate segment: piecewise linear interpolation
  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];

    if (safeWind >= p1.wind && safeWind <= p2.wind) {
      const span = p2.wind - p1.wind;
      if (span === 0) return p1.score;
      const fraction = (safeWind - p1.wind) / span;
      return p1.score + fraction * (p2.score - p1.score);
    }
  }

  return 0;
}
