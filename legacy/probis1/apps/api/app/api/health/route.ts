import { ok } from "@/lib/responses";
import { withApiHandler } from "@/lib/handler";

export const GET = withApiHandler((_request, { requestId }) =>
  ok(
    {
      service: "probis-api",
      status: "healthy",
      uptime: process.uptime(),
      checkedAt: new Date().toISOString()
    },
    requestId
  )
);
