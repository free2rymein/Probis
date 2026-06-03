export const formatCompactCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
};

export const formatProbability = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value >= 0.999) return ">99%";
  if (value <= 0.001) return "<1%";
  return `${Math.round(value * 100)}%`;
};

export const formatPrice = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}c`;
};

export const formatProbabilityDelta = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const percentagePoints = value * 100;
  return `${percentagePoints > 0 ? "+" : ""}${percentagePoints.toFixed(1)}%`;
};

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

export const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return "Not updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not updated";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

export const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
