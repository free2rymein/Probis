import { serverEnvSchema } from "@probis/shared";

export const getApiEnv = () => serverEnvSchema.parse(process.env);
