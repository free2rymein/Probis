import { ok } from "@/lib/responses";
import { withApiHandler } from "@/lib/handler";
import type { TimelineEvent } from "@probis/types";

export const GET = withApiHandler((_request, { requestId }) =>
  ok<{ events: TimelineEvent[]; nextCursor: string | null }>(
    {
      events: [],
      nextCursor: null
    },
    requestId
  )
);
