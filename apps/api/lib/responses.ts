import { NextResponse } from "next/server";
import type { ApiError, ApiResponse, ApiSuccess } from "@probis/types";

export const apiMeta = (requestId: string) => ({
  requestId,
  timestamp: new Date().toISOString()
});

export const ok = <TData>(data: TData, requestId: string, init?: ResponseInit) => {
  const payload: ApiSuccess<TData> = {
    ok: true,
    data,
    meta: apiMeta(requestId)
  };

  return NextResponse.json(payload, init);
};

export const fail = (
  code: string,
  message: string,
  requestId: string,
  init: ResponseInit = { status: 500 },
  details?: Record<string, unknown>
) => {
  const payload: ApiError = {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    meta: apiMeta(requestId)
  };

  return NextResponse.json(payload, init);
};

export const notImplemented = (
  resource: string,
  requestId: string
): NextResponse<ApiResponse<never>> =>
  fail(
    "NOT_IMPLEMENTED",
    `${resource} endpoint is prepared but not connected to a datastore.`,
    requestId,
    {
      status: 501
    }
  );
