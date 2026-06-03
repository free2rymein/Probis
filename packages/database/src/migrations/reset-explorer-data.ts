import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { getMigrationEnv } from "../env";

const CONFIRMATION = "RESET_PROBIS2_EXPLORER_DATA";
const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");

loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

if (process.env.PROBIS_DEV_RESET_CONFIRM !== CONFIRMATION) {
  throw new Error(`Set PROBIS_DEV_RESET_CONFIRM=${CONFIRMATION} to run the development explorer reset.`);
}

const sqlFile = resolve(process.cwd(), "sql/probis2-reset-explorer-data.sql");
const connection = postgres(getMigrationEnv().DATABASE_URL, { max: 1, prepare: false });

try {
  await connection.unsafe(readFileSync(sqlFile, "utf8"));
  console.warn(JSON.stringify({ level: "warn", event: "probis2.explorer_reset.complete", sqlFile }));
} finally {
  await connection.end();
}
