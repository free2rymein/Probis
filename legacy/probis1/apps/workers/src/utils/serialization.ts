export const serializeForHash = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return JSON.stringify(value, (_key, nestedValue: unknown) =>
      nestedValue instanceof Date ? nestedValue.toISOString() : nestedValue
    );
  }
  return String(value);
};

export const serializeJson = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      nestedValue instanceof Date ? nestedValue.toISOString() : nestedValue
    )
  ) as T;
