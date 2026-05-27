import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { getMigrationEnv } from "./src/env";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");

loadEnv({ path: rootEnvPath });

if (existsSync(packageEnvPath)) {
  loadEnv({ path: packageEnvPath, override: true });
}

const env = getMigrationEnv();

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL
  },
  strict: true,
  verbose: true
});
