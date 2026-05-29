import { sql } from "drizzle-orm";
import { systemStatus, type ProbisDatabase } from "@probis/database";
import { serializeJson } from "../utils/serialization";

type StatusInput = {
  serviceName: string;
  status: "standby" | "running" | "degraded" | "stale";
  statusMessage?: string;
  metadata?: Record<string, unknown>;
};

export const createSystemStatusRepository = (db: ProbisDatabase) => ({
  async heartbeat(input: StatusInput) {
    const now = new Date();
    await db
      .insert(systemStatus)
      .values({
        serviceName: input.serviceName,
        status: input.status,
        statusMessage: input.statusMessage ?? null,
        lastHeartbeatAt: now,
        metadata: serializeJson(input.metadata ?? {}),
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemStatus.serviceName,
        set: {
          status: sql`excluded.status`,
          statusMessage: sql`excluded.status_message`,
          lastHeartbeatAt: sql`excluded.last_heartbeat_at`,
          metadata: sql`${systemStatus.metadata} || excluded.metadata`,
          updatedAt: sql`excluded.updated_at`
        }
      });
  },

  async success(input: Omit<StatusInput, "status"> & { status?: StatusInput["status"] }) {
    const now = new Date();
    await db
      .insert(systemStatus)
      .values({
        serviceName: input.serviceName,
        status: input.status ?? "running",
        statusMessage: input.statusMessage ?? null,
        lastHeartbeatAt: now,
        lastSuccessAt: now,
        metadata: serializeJson(input.metadata ?? {}),
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemStatus.serviceName,
        set: {
          status: sql`excluded.status`,
          statusMessage: sql`excluded.status_message`,
          lastHeartbeatAt: sql`excluded.last_heartbeat_at`,
          lastSuccessAt: sql`excluded.last_success_at`,
          metadata: sql`${systemStatus.metadata} || excluded.metadata`,
          updatedAt: sql`excluded.updated_at`
        }
      });
  },

  async failure(input: Omit<StatusInput, "status">) {
    const now = new Date();
    await db
      .insert(systemStatus)
      .values({
        serviceName: input.serviceName,
        status: "degraded",
        statusMessage: input.statusMessage ?? null,
        lastHeartbeatAt: now,
        lastFailureAt: now,
        metadata: serializeJson(input.metadata ?? {}),
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemStatus.serviceName,
        set: {
          status: sql`excluded.status`,
          statusMessage: sql`excluded.status_message`,
          lastHeartbeatAt: sql`excluded.last_heartbeat_at`,
          lastFailureAt: sql`excluded.last_failure_at`,
          metadata: sql`${systemStatus.metadata} || excluded.metadata`,
          updatedAt: sql`excluded.updated_at`
        }
      });
  }
});
