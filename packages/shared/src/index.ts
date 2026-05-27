import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export const APP_NAME = "Probis";

export const SEVERITY_ORDER = {
  neutral: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
} as const;

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);

export const formatPercent = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export const createLogger = (scope: string) => {
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const payload = {
      level,
      scope,
      message,
      time: new Date().toISOString(),
      ...fields
    };

    if (level === "error") {
      console.error(JSON.stringify(payload));
      return;
    }

    if (level === "warn") {
      console.warn(JSON.stringify(payload));
      return;
    }

    console.warn(JSON.stringify(payload));
  };

  return {
    debug: (message: string, fields?: LogFields) => write("debug", message, fields),
    info: (message: string, fields?: LogFields) => write("info", message, fields),
    warn: (message: string, fields?: LogFields) => write("warn", message, fields),
    error: (message: string, fields?: LogFields) => write("error", message, fields)
  };
};

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});
