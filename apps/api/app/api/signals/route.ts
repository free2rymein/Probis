import type { AnomalySignal, PaginatedResponse } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { queryObject, signalsQuerySchema } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

type SignalRow = {
  id: string;
  market_id: string;
  market_title: string;
  anomaly_type: string;
  severity_score: string;
  confidence_score: string;
  summary: string;
  wallet_addresses: string[] | null;
  metadata: Record<string, unknown>;
  detected_at: Date;
  created_at: Date;
  total_count: string;
};

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = signalsQuerySchema.parse(queryObject(request));
  const sql = getSql();

  const sortExpression =
    query.sort === "detected_at" ? sql`ae.detected_at` : sql`ae.severity_score`;
  const directionExpression = query.direction === "asc" ? sql`ASC` : sql`DESC`;

  const rows = await sql<SignalRow[]>`
    WITH filtered AS (
      SELECT
        ae.id,
        ae.market_id,
        m.title AS market_title,
        ae.anomaly_type,
        ae.severity_score,
        ae.confidence_score,
        ae.summary,
        ae.wallet_addresses,
        ae.metadata,
        ae.detected_at,
        ae.created_at,
        COUNT(*) OVER()::text AS total_count
      FROM anomaly_events ae
      INNER JOIN markets m ON m.id = ae.market_id
      WHERE
        ae.detected_at >= now() - (${query.lookbackHours}::int * interval '1 hour')
        AND
        (${query.anomalyType ?? null}::text IS NULL OR ae.anomaly_type::text = ${query.anomalyType ?? null})
        AND (${query.minSeverity ?? null}::numeric IS NULL OR ae.severity_score >= ${query.minSeverity ?? null})
      ORDER BY ${sortExpression} ${directionExpression}, ae.detected_at DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    )
    SELECT * FROM filtered
  `;

  const total = Number(rows[0]?.total_count ?? 0);
  const data: PaginatedResponse<AnomalySignal> = {
    items: rows.map((row) => ({
      id: row.id,
      marketId: row.market_id,
      marketTitle: row.market_title,
      anomalyType: row.anomaly_type,
      severityScore: Number(row.severity_score),
      confidenceScore: Number(row.confidence_score),
      summary: row.summary,
      walletAddresses: row.wallet_addresses ?? [],
      metadata: row.metadata,
      detectedAt: row.detected_at.toISOString(),
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
