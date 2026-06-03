import { createLogger } from "@probis/shared";
import { ZodError } from "zod";
import { getRequestId, getRoute } from "./request";
import { fail } from "./responses";

const logger = createLogger("api");

export const withApiHandler =
  (
    handler: (
      request: Request,
      context: { requestId: string },
      routeContext?: unknown
    ) => Promise<Response> | Response
  ) =>
  async (request: Request, routeContext?: unknown) => {
    const requestId = getRequestId(request);
    const route = getRoute(request);
    try {
      return await handler(request, { requestId }, routeContext);
    } catch (error) {
      logger.error("request.error", {
        requestId,
        route,
        message: error instanceof Error ? error.message : "Unknown error"
      });
      return error instanceof ZodError
        ? fail("VALIDATION_ERROR", "Invalid request parameters.", requestId, 400)
        : fail("INTERNAL_ERROR", "Unexpected API error.", requestId);
    }
  };
