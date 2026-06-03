import { z } from "zod";

const qualityEnvSchema = z.object({
  MIN_EVENT_VOLUME: z.coerce.number().nonnegative().default(5_000),
  MIN_EVENT_LIQUIDITY: z.coerce.number().nonnegative().default(500),
  MIN_EVENT_VOLUME_24H: z.coerce.number().nonnegative().default(0)
});

const quality = qualityEnvSchema.parse(process.env);

export const explorerEventQualityFilter = (alias: string) => `
  coalesce(${alias}.volume, 0) >= ${quality.MIN_EVENT_VOLUME}
  and coalesce(${alias}.liquidity, 0) >= ${quality.MIN_EVENT_LIQUIDITY}
  and coalesce(${alias}.volume_24h, 0) >= ${quality.MIN_EVENT_VOLUME_24H}
`;
