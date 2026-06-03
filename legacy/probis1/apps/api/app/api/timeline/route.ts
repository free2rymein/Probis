import type { PaginatedResponse, TimelineListItem } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { queryObject, timelineQuerySchema } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

type TimelineRow = {
  id: string;
  market_id: string;
  event_type: string;
  event_timestamp: Date;
  payload: Record<string, unknown>;
  created_at: Date;
  total_count: string;
};

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = timelineQuerySchema.parse(queryObject(request));
  const sql = getSql();

  const rows = await sql<TimelineRow[]>`
    SELECT
      id,
      market_id,
      event_type::text AS event_type,
      event_timestamp,
      payload,
      created_at,
      COUNT(*) OVER()::text AS total_count
    FROM market_timeline
    WHERE
      (${query.marketId ?? null}::uuid IS NULL OR market_id = ${query.marketId ?? null}::uuid)
      AND (${query.eventType ?? null}::timeline_event_type IS NULL OR event_type = ${query.eventType ?? null}::timeline_event_type)
    ORDER BY event_timestamp DESC
    LIMIT ${query.limit}
    OFFSET ${query.offset}
  `;

  const total = Number(rows[0]?.total_count ?? 0);
  const data: PaginatedResponse<TimelineListItem> = {
    items: rows.map((row) => ({
      id: row.id,
      marketId: row.market_id,
      eventType: row.event_type,
      eventTimestamp: row.event_timestamp.toISOString(),
      payload: row.payload,
      createdAt: row.created_at.toISOString()
    })),
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
      nextOffset: query.offset + query.limit < total ? query.offset + query.limit : null
    }
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
