import { z } from "zod";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1)
});

export const getDatabaseEnv = (env: NodeJS.ProcessEnv = process.env) =>
  databaseEnvSchema.parse(env);

export const getMigrationEnv = getDatabaseEnv;
