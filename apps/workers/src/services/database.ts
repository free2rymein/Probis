import postgres from "postgres";
import type { WorkerConfig } from "../config/env";

type WorkerDatabaseOptions = {
  max?: number;
  disableIdleTimeout?: boolean;
};

export const createWorkerDatabase = (config: WorkerConfig, options: WorkerDatabaseOptions = {}) => {
  const sql = postgres(config.DATABASE_URL, {
    max: options.max ?? 5,
    prepare: false,
    ...(options.disableIdleTimeout ? {} : { idle_timeout: 20 }),
    connect_timeout: 10
  });

  return { sql, close: () => sql.end() };
};
