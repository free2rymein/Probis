import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getMigrationEnv } from "../env";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");

loadEnv({ path: rootEnvPath });

if (existsSync(packageEnvPath)) {
  loadEnv({ path: packageEnvPath, override: true });
}

const migrationsFolder = resolve(process.cwd(), "migrations");
const env = getMigrationEnv();

const connection = postgres(env.DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10
});

const db = drizzle(connection);

try {
  await migrate(db, {
    migrationsFolder,
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations"
  });

  console.warn(
    JSON.stringify({
      level: "info",
      event: "migrations.complete",
      migrationsFolder
    })
  );
} finally {
  await connection.end();
}
