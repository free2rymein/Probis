import { z } from "zod";

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required")
});

export const publicSupabaseEnvSchema = databaseEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true
});

export const migrationEnvSchema = databaseEnvSchema.pick({
  DATABASE_URL: true
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type MigrationEnv = z.infer<typeof migrationEnvSchema>;

export const getDatabaseEnv = (env: unknown = process.env): DatabaseEnv =>
  databaseEnvSchema.parse(env);
export const getMigrationEnv = (env: unknown = process.env): MigrationEnv =>
  migrationEnvSchema.parse(env);
