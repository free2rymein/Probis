import { withApiHandler } from "@/lib/handler";
import { ok } from "@/lib/responses";

export const GET = withApiHandler(async (_request, { requestId }) =>
  ok({ status: "ok", service: "probis-api", schema: "probis2_foundation" }, requestId)
);
