import { setTimeout as delay } from 'node:timers/promises';
import type { RateLimiterConfig } from './types';

interface QueuedRequest {
  resolve: () => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
}

const createAbortError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

export class RateLimiter {
  private available: number;
  private readonly queue: QueuedRequest[] = [];
  private readonly maxQueue: number | undefined;
  private timer: NodeJS.Timeout;

  constructor(private readonly config: RateLimiterConfig) {
    this.available = config.requests;
    this.maxQueue = config.maxQueue;
    this.timer = setInterval(() => this.refill(), config.intervalMs);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw createAbortError();
    }

    if (this.available > 0) {
      this.available -= 1;
      return;
    }

    if (this.maxQueue && this.queue.length >= this.maxQueue) {
      throw new Error('Rate limiter queue is full.');
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueuedRequest = { resolve, reject, signal };
      this.queue.push(entry);

      signal?.addEventListener(
        'abort',
        () => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) {
            this.queue.splice(index, 1);
          }
          reject(createAbortError());
        },
        { once: true },
      );
    });
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0) {
      await delay(this.config.intervalMs);
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.queue.splice(0, this.queue.length);
  }

  private refill(): void {
    this.available = this.config.requests;

    while (this.available > 0 && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        break;
      }

      if (next.signal?.aborted) {
        next.reject(createAbortError());
        continue;
      }

      this.available -= 1;
      next.resolve();
    }
  }
}

