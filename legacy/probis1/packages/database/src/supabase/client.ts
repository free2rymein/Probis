import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDatabaseEnv, publicSupabaseEnvSchema } from "../env";
import type { Database } from "./types";

export type ProbisSupabaseClient = SupabaseClient<Database>;

export type SupabaseCookieAdapter = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: CookieOptions) => void;
  remove: (name: string, options: CookieOptions) => void;
};

export const createBrowserSupabaseClient = (env: unknown = process.env) => {
  const parsed = publicSupabaseEnvSchema.parse(env);
  return createBrowserClient<Database>(
    parsed.NEXT_PUBLIC_SUPABASE_URL,
    parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};

export const createServerSupabaseClient = (
  cookies: SupabaseCookieAdapter,
  env: unknown = process.env
) => {
  const parsed = publicSupabaseEnvSchema.parse(env);

  return createServerClient<Database>(
    parsed.NEXT_PUBLIC_SUPABASE_URL,
    parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies
    }
  );
};

export const createAdminSupabaseClient = (env: unknown = process.env): ProbisSupabaseClient => {
  const parsed = getDatabaseEnv(env);

  return createClient<Database>(parsed.NEXT_PUBLIC_SUPABASE_URL, parsed.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
