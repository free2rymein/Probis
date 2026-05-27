import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@probis/database";
import type { WorkerConfig } from "../config/env";

export const createWorkerDatabase = (config: WorkerConfig) => {
  const connection = postgres(config.DATABASE_URL, {
    max: 2,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10
  });

  return {
    db: drizzle(connection, { schema }),
    close: () => connection.end()
  };
};
