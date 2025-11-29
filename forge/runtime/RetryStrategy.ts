import { setTimeout as delay } from 'node:timers/promises';
import type { RetryStrategyConfig } from './types';

const defaultConfig: Required<RetryStrategyConfig> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  multiplier: 2,
  jitter: 0.3,
};

export class RetryStrategy {
  private readonly config: Required<RetryStrategyConfig>;

  constructor(config: RetryStrategyConfig = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async execute<T>(
    task: (attempt: number) => Promise<T>,
    onError?: (error: unknown, attempt: number) => void,
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.config.maxAttempts) {
      attempt += 1;
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        onError?.(error, attempt);
        if (attempt >= this.config.maxAttempts) {
          break;
        }
        const waitTime = this.computeDelay(attempt);
        await delay(waitTime);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  private computeDelay(attempt: number): number {
    const exponentialDelay =
      this.config.baseDelayMs *
      Math.pow(this.config.multiplier, attempt - 1);
    const boundedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
    const jitterDelta = boundedDelay * this.config.jitter;
    const jitter =
      Math.random() * jitterDelta * 2 - jitterDelta; // +/- jitter
    return Math.max(0, Math.round(boundedDelay + jitter));
  }
}

