export const elapsedMs = (startedAt: number) => Number((performance.now() - startedAt).toFixed(1));

export const logApiTiming = (event: string, fields: Record<string, string | number | boolean | null>) => {
  if (process.env.NODE_ENV === "production") return;
  console.warn(JSON.stringify({ level: "info", scope: "api", event, ...fields }));
};
