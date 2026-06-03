import { publicEnvSchema } from "@probis/shared";

export const getWebEnv = () => publicEnvSchema.parse(process.env);
