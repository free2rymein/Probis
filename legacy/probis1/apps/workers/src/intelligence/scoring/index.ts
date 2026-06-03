const clampScore = (score: number): number => Math.max(0, Math.min(100, Math.round(score)));

export const scoreProbabilityShock = ({
  largestMove,
  fastestWindowMinutes,
  bucketCount,
  confirmedWindows
}: {
  largestMove: number;
  fastestWindowMinutes: number;
  bucketCount: number;
  confirmedWindows: number;
}) => ({
  severityScore: clampScore(largestMove * 420 + (60 / fastestWindowMinutes) * 6),
  confidenceScore: clampScore(45 + Math.min(bucketCount, 60) * 0.55 + confirmedWindows * 8)
});

export const scoreVolumeSpike = ({
  multiple,
  bucketCount
}: {
  multiple: number;
  bucketCount: number;
}) => ({
  severityScore: clampScore(35 + Math.log2(Math.max(multiple, 1)) * 24),
  confidenceScore: clampScore(45 + Math.min(bucketCount, 60) * 0.6)
});

export const scoreActivityBurst = ({
  multiple,
  bucketCount
}: {
  multiple: number;
  bucketCount: number;
}) => ({
  severityScore: clampScore(30 + Math.log2(Math.max(multiple, 1)) * 22),
  confidenceScore: clampScore(42 + Math.min(bucketCount, 60) * 0.6)
});

export const scoreWhaleActivity = (usdValue: number) => ({
  severityScore: clampScore(45 + Math.log10(Math.max(usdValue, 1_000) / 1_000) * 22),
  confidenceScore: clampScore(70 + Math.min(usdValue / 25_000, 1) * 15)
});
