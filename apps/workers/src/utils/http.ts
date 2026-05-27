import type { WorkerConfig } from "../config/env";

export async function fetchJson<T>(url: URL, config: WorkerConfig): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "probis-workers/0.1"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url.toString()}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
