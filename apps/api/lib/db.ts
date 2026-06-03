import postgres from "postgres";
import { z } from "zod";

const envSchema = z.object({ DATABASE_URL: z.string().min(1) });
let client: postgres.Sql | null = null;

export const getSql = () => {
  if (client) return client;
  const env = envSchema.parse(process.env);
  client = postgres(env.DATABASE_URL, {
    max: 3,
    prepare: false,
    idle_timeout: 120,
    connect_timeout: 10
  });
  return client;
};
