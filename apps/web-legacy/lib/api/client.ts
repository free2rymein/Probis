import type { ApiResponse } from "@probis/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

export async function apiGet<TData>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
  signal?: AbortSignal
): Promise<TData> {
  const url = new URL(path, API_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json"
    },
    signal
  });

  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || !payload.ok) {
    const message = payload.ok ? response.statusText : payload.error.message;
    const code = payload.ok ? undefined : payload.error.code;
    throw new ApiClientError(message, response.status, code);
  }

  return payload.data;
}
