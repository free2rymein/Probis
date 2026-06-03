import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { ok } from "@/lib/responses";

export const GET = withApiHandler(async (_request, { requestId }) => {
  const rows = await getSql()<Array<{ id: string; slug: string; name: string; created_at: Date }>>`
    select id, slug, name, created_at from venues order by name asc
  `;
  return ok(rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, createdAt: row.created_at.toISOString() })), requestId);
});
