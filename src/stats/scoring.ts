/**
 * Supported CEFR levels.
 */
export type CefrLevel =
  | "A2"
  | "B1"
  | "B1+"
  | "B2"
  | "B2+"
  | "C1"
  | "C2";

/**
 * Word entry minimal shape for scoring.
 */
export interface WordLike {
  level?: string;
}

/**
 * Level distribution structure.
 */
export type LevelDistribution = Record<CefrLevel, number>;

/**
 * Numeric weight per CEFR level.
 */
const LEVEL_WEIGHTS: Record<CefrLevel, number> = {
  A2: 2,
  B1: 3,
  "B1+": 3.5,
  B2: 4,
  "B2+": 4.5,
  C1: 5,
  C2: 6
};

/**
 * Create empty distribution object.
 */
export function createEmptyDistribution(): LevelDistribution {
  return {
    A2: 0,
    B1: 0,
    "B1+": 0,
    B2: 0,
    "B2+": 0,
    C1: 0,
    C2: 0
  };
}

/**
 * Compute CEFR level distribution from word list.
 */
export function computeDistribution(
  words: WordLike[]
): LevelDistribution {
  const distribution = createEmptyDistribution();

  for (const w of words) {
    const level = w.level as CefrLevel;

    if (level && level in distribution) {
      distribution[level]++;
    }
  }

  return distribution;
}

/**
 * Compute weighted difficulty score.
 */
export function computeScore(
  distribution: LevelDistribution
): number {
  let weightedSum = 0;
  let totalCount = 0;

  for (const level in distribution) {
    const count = distribution[level as CefrLevel];
    const weight = LEVEL_WEIGHTS[level as CefrLevel];

    weightedSum += count * weight;
    totalCount += count;
  }

  if (totalCount === 0) return 0;

  return weightedSum / totalCount;
}

/**
 * Convert numeric score to CEFR label.
 */
export function scoreToLevel(score: number): CefrLevel {
  if (score < 2.5) return "A2";
  if (score < 3.25) return "B1";
  if (score < 3.75) return "B1+";
  if (score < 4.25) return "B2";
  if (score < 4.75) return "B2+";
  if (score < 5.5) return "C1";
  return "C2";
}

/**
 * Aggregate multiple distributions (chapter or book level).
 */
export function mergeDistributions(
  distributions: LevelDistribution[]
): LevelDistribution {
  const result = createEmptyDistribution();

  for (const dist of distributions) {
    for (const level in result) {
      result[level as CefrLevel] +=
        dist[level as CefrLevel] || 0;
    }
  }

  return result;
}