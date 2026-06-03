export const floorToMinute = (date: Date): Date => {
  const bucket = new Date(date);
  bucket.setUTCSeconds(0, 0);
  return bucket;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const jitter = (baseMs: number) => Math.round(baseMs * (0.8 + Math.random() * 0.4));
