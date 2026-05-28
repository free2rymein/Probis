import { logger } from "../utils/logger";
import { errorFields } from "../utils/errors";

export type BatcherOptions<T> = {
  name: string;
  maxSize: number;
  flushIntervalMs: number;
  flush: (items: T[]) => Promise<void>;
};

export class Batcher<T> {
  private readonly items: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private readonly options: BatcherOptions<T>) {}

  start() {
    this.timer = setInterval(() => void this.flush(), this.options.flushIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  add(item: T) {
    this.items.push(item);

    if (this.items.length >= this.options.maxSize) {
      void this.flush();
    }
  }

  addMany(items: T[]) {
    for (const item of items) {
      this.add(item);
    }
  }

  async flush() {
    if (this.flushing || this.items.length === 0) return;

    this.flushing = true;
    const batch = this.items.splice(0, this.options.maxSize);

    try {
      await this.options.flush(batch);
      logger.info("batch.flush", { name: this.options.name, size: batch.length });
    } catch (error) {
      this.items.unshift(...batch);
      logger.error("batch.flush_failed", {
        name: this.options.name,
        size: batch.length,
        ...errorFields(error)
      });
    } finally {
      this.flushing = false;
    }
  }

  get size() {
    return this.items.length;
  }
}
