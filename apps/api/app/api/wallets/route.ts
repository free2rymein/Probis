import { ok } from "@/lib/responses";
import { withApiHandler } from "@/lib/handler";
import type { Wallet } from "@probis/types";

export const GET = withApiHandler((_request, { requestId }) =>
  ok<{ wallets: Wallet[]; nextCursor: string | null }>(
    {
      wallets: [],
      nextCursor: null
    },
    requestId
  )
);
