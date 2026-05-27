import { ok } from "@/lib/responses";
import { withApiHandler } from "@/lib/handler";
import type { Signal } from "@probis/types";

export const GET = withApiHandler((_request, { requestId }) =>
  ok<{ signals: Signal[]; nextCursor: string | null }>(
    {
      signals: [],
      nextCursor: null
    },
    requestId
  )
);
