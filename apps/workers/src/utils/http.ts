import type { WorkerConfig } from "../config/env";
import { logger } from "./logger";
import { jitter, sleep } from "./time";

export async function fetchJson<T>(url: URL, config: WorkerConfig): Promise<T> {
  let attempt = 0;

  while (true) {
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

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retryable HTTP ${response.status} for ${url.toString()}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url.toString()}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      attempt += 1;
      if (attempt >= 3) throw error;

      logger.warn("http.retry", {
        url: url.origin + url.pathname,
        attempt,
        message: error instanceof Error ? error.message : "Unknown HTTP error"
      });
      await sleep(jitter(500 * 2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
}
