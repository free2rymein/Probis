import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnv } from "./env";
import * as schema from "./schema";

export type ProbisDatabase = PostgresJsDatabase<typeof schema>;

export type DatabaseClientOptions = {
  maxConnections?: number;
  prepare?: boolean;
};

export const createPostgresConnection = (options: DatabaseClientOptions = {}) => {
  const env = getDatabaseEnv();

  return postgres(env.DATABASE_URL, {
    max: options.maxConnections ?? 5,
    prepare: options.prepare ?? false,
    idle_timeout: 20,
    connect_timeout: 10
  });
};

export const createDatabaseClient = (options?: DatabaseClientOptions): ProbisDatabase => {
  const connection = createPostgresConnection(options);
  return drizzle(connection, { schema });
};
