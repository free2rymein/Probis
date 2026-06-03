import { ZodError } from "zod";
import { createLogger } from "@probis/shared";
import { fail } from "./responses";
import { getRequestId, getRoute } from "./request";

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
    const startedAt = performance.now();

    logger.info("request.start", {
      requestId,
      route,
      method: request.method
    });

    try {
      const response = await handler(request, { requestId }, routeContext);
      logger.info("request.end", {
        requestId,
        route,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      logger.error("request.error", {
        requestId,
        route,
        message: error instanceof Error ? error.message : "Unknown error"
      });

      if (error instanceof ZodError) {
        return fail(
          "VALIDATION_ERROR",
          "Invalid request or environment configuration.",
          requestId,
          { status: 400 },
          {
            issues: error.flatten()
          }
        );
      }

      return fail("INTERNAL_ERROR", "Unexpected API error.", requestId, { status: 500 });
    }
  };
