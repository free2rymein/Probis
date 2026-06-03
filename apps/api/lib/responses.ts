import { NextResponse } from "next/server";
import type { ApiError, ApiSuccess } from "@probis/types";

const meta = (requestId: string) => ({ requestId, timestamp: new Date().toISOString() });

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,x-request-id",
  "cache-control": "no-store"
};

export const ok = <T>(data: T, requestId: string, init?: ResponseInit) => {
  const payload: ApiSuccess<T> = { ok: true, data, meta: meta(requestId) };
  return NextResponse.json(payload, { ...init, headers: { ...headers, ...init?.headers } });
};

export const fail = (code: string, message: string, requestId: string, status = 500) => {
  const payload: ApiError = { ok: false, error: { code, message }, meta: meta(requestId) };
  return NextResponse.json(payload, { status, headers });
};
