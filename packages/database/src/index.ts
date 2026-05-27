import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnvSchema, serverEnvSchema } from "@probis/shared";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ProbisSupabaseClient = SupabaseClient<Database>;

export const createBrowserSupabaseClient = (env: unknown = process.env): ProbisSupabaseClient => {
  const parsed = publicEnvSchema.parse(env);

  return createClient<Database>(
    parsed.NEXT_PUBLIC_SUPABASE_URL,
    parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );
};

export const createServiceSupabaseClient = (env: unknown = process.env): ProbisSupabaseClient => {
  const parsed = serverEnvSchema
    .extend({
      SUPABASE_SERVICE_ROLE_KEY: serverEnvSchema.shape.SUPABASE_SERVICE_ROLE_KEY.unwrap()
    })
    .parse(env);

  return createClient<Database>(parsed.NEXT_PUBLIC_SUPABASE_URL, parsed.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
