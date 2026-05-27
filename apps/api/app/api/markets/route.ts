import { ok } from "@/lib/responses";
import { withApiHandler } from "@/lib/handler";
import type { Market } from "@probis/types";

export const GET = withApiHandler((_request, { requestId }) =>
  ok<{ markets: Market[]; nextCursor: string | null }>(
    {
      markets: [],
      nextCursor: null
    },
    requestId
  )
);
