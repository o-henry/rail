export const QUALITY_THRESHOLD_MIN = 10;
export const QUALITY_THRESHOLD_MAX = 100;
export const QUALITY_THRESHOLD_STEP = 10;
export const QUALITY_DEFAULT_THRESHOLD = 70;

export function normalizeQualityThreshold(value: unknown): number {
  const parsed = Number(value);
  const fallback = QUALITY_DEFAULT_THRESHOLD;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  const clamped = Math.max(QUALITY_THRESHOLD_MIN, Math.min(QUALITY_THRESHOLD_MAX, safe));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}

export function normalizeQualityScore(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}
