import { EventEmitter } from 'node:events';
import forgeConnect from '../utils/ForgeConnect';
import {
  AuthManager,
  authManager,
  configureAuthManagerVault,
} from '../utils/AuthManager';
import type { BaseConnector } from '../connectors/BaseConnector';
import type { ConnectorQueryResponse } from '../connectors/types';
import { RateLimiter } from './RateLimiter';
import { RetryStrategy } from './RetryStrategy';
import { ForgeMemoryGraph } from './ForgeMemoryGraph';
import type {
  ConnectorExecutionConfig,
  ForgeExecutionResult,
  ForgeJob,
  ForgeJobResult,
  ForgePlan,
  ForgePlanStep,
  ForgeRuntimeOptions,
  ForgeTelemetryEvent,
  RetryStrategyConfig,
} from './types';

interface ConnectorRuntimeConfig {
  rateLimiter?: RateLimiter;
  retry?: RetryStrategy;
}

const DEFAULT_CONCURRENCY = 4;

export class ForgeRuntime extends EventEmitter {
  private readonly auth: AuthManager;
  private readonly memoryGraph = new ForgeMemoryGraph();
  private readonly connectorConfig = new Map<string, ConnectorRuntimeConfig>();
  private readonly options: ForgeRuntimeOptions;

  constructor(options: ForgeRuntimeOptions = {}) {
    super();
    this.options = options;
    this.auth = options.authManager ?? authManager;
    void configureAuthManagerVault();
    this.applyDefaultConfigs();
  }

  getAuthManager(): AuthManager {
    return this.auth;
  }

  getMemoryGraph(): ForgeMemoryGraph {
    return this.memoryGraph;
  }

  configureConnector(
    name: string,
    config: ConnectorExecutionConfig,
  ): void {
    const existing = this.connectorConfig.get(name) ?? {};

    if (config.rateLimit) {
      existing.rateLimiter = new RateLimiter(config.rateLimit);
    }

    if (config.retry) {
      existing.retry = new RetryStrategy(config.retry);
    }

    this.connectorConfig.set(name, existing);
  }

  async executePlan(plan: ForgePlan): Promise<ForgeExecutionResult> {
    const jobs = new Map<string, ForgePlanStep>();
    plan.steps.forEach((step) => jobs.set(step.id, step));

    const completed = new Map<string, ForgeJobResult>();
    const failed = new Set<string>();

    while (completed.size + failed.size < plan.steps.length) {
      const ready = plan.steps.filter((step) => {
        if (completed.has(step.id) || failed.has(step.id)) {
          return false;
        }

        const deps = step.dependsOn ?? [];
        return deps.every((dep) => completed.has(dep));
      });

      if (ready.length === 0) {
        throw new Error(
          'No executable steps found; possible circular dependency or prior failure.',
        );
      }

      const concurrency =
        this.options.maxConcurrentJobs ?? DEFAULT_CONCURRENCY;

      for (let i = 0; i < ready.length; i += concurrency) {
        const batch = ready.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (step) => {
            try {
              const result = await this.executeStep(plan, step);
              completed.set(step.id, result);
              return result;
            } catch (error) {
              failed.add(step.id);
              const err = error instanceof Error ? error : new Error(String(error));
              this.emitTelemetry({
                type: 'job_failed',
                payload: {
                  job: this.buildJobRecord(step),
                  error: err,
                  attempt: 0,
                },
              });
              return null;
            }
          }),
        );

        results.forEach((result, index) => {
          const step = batch[index];
          if (!result) {
            return;
          }
          completed.set(step.id, result);
        });

        if (failed.size > 0) {
          break;
        }
      }

      if (failed.size > 0) {
        break;
      }
    }

    const result: ForgeExecutionResult = {
      planId: plan.id,
      status:
        failed.size === 0
          ? 'success'
          : completed.size > 0
          ? 'partial'
          : 'failed',
      results: Array.from(completed.values()),
      metadata: plan.metadata,
    };

    this.emitTelemetry({
      type: 'plan_completed',
      payload: { result },
    });

    return result;
  }

  private async executeStep(
    plan: ForgePlan,
    step: ForgePlanStep,
  ): Promise<ForgeJobResult> {
    const job = this.buildJobRecord(step);
    this.emit('job:queued', job);
    this.emitTelemetry({ type: 'job_queued', payload: { job } });

    const connector = await this.getConnector(step.connector);

    const config = this.connectorConfig.get(step.connector) ?? {};
    const rateLimiter = config.rateLimiter;
    const retryStrategy =
      config.retry ??
      new RetryStrategy(this.options.defaultRetry);

    const startTime = new Date();
    this.emit('job:started', job);
    this.emitTelemetry({ type: 'job_started', payload: { job } });

    let attempts = 0;
    const result = await retryStrategy.execute(
      async (attempt) => {
        attempts = attempt;
        if (rateLimiter) {
          await rateLimiter.acquire();
        }

        const data = await connector.query(
          step.action,
          step.params,
          step.context,
        );

        return this.buildJobResult(
          job,
          'success',
          attempt,
          startTime,
          data,
        );
      },
      (error, attempt) => {
        this.emitTelemetry({
          type: 'job_failed',
          payload: { job, error: error as Error, attempt },
        });
        attempts = attempt;
      },
    ).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      return this.buildJobResult(
        job,
        'error',
        attempts || 1,
        startTime,
        undefined,
        err,
      );
    });

    if (result.status === 'success') {
      this.memoryGraph.upsertNode(job, result);
    }

    this.emit('job:finished', result);
    this.emitTelemetry({ type: 'job_finished', payload: { result } });

    return result;
  }

  private async getConnector(
    name: string,
  ): Promise<BaseConnector> {
    return forgeConnect.connect(name as any, {
      deps: { authManager: this.auth },
    });
  }

  private buildJobRecord(step: ForgePlanStep): ForgeJob {
    return {
      id: step.id,
      connector: step.connector,
      action: step.action,
      params: step.params,
      context: step.context,
      dependsOn: step.dependsOn,
      metadata: step.metadata,
      status: 'queued',
      attempts: 0,
    };
  }

  private buildJobResult(
    job: ForgeJob,
    status: ForgeJobResult['status'],
    attempts: number,
    startedAt: Date,
    data?: ConnectorQueryResponse,
    error?: Error,
  ): ForgeJobResult {
    const finishedAt = new Date();
    return {
      jobId: job.id,
      connector: job.connector,
      action: job.action,
      status,
      attempts,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      data,
      error: error
        ? {
            message: error.message,
            details: {
              stack: error.stack,
            },
          }
        : undefined,
      metadata: job.metadata,
    };
  }

  private emitTelemetry(event: ForgeTelemetryEvent): void {
    this.options.telemetry?.emit(event);
  }

  private applyDefaultConfigs(): void {
    const defaultRateLimits: Record<string, { requests: number; intervalMs: number }> = {
      slack: { requests: 50, intervalMs: 60_000 },
      gmail: { requests: 30, intervalMs: 60_000 },
      notion: { requests: 3, intervalMs: 1_000 },
      github: { requests: 5_000, intervalMs: 3_600_000 },
      stripe: { requests: 100, intervalMs: 60_000 },
      google_drive: { requests: 100, intervalMs: 60_000 },
      hubspot: { requests: 100, intervalMs: 10_000 },
      clickup: { requests: 100, intervalMs: 60_000 },
      trello: { requests: 300, intervalMs: 60_000 },
      discord: { requests: 50, intervalMs: 10_000 },
    };

    const defaultRetry: RetryStrategyConfig = {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
      multiplier: 2,
      jitter: 0.25,
    };

    Object.entries(defaultRateLimits).forEach(([name, config]) => {
      this.configureConnector(name, {
        rateLimit: config,
        retry: defaultRetry,
      });
    });
  }
}

export const createDefaultForgeRuntime = (
  options?: ForgeRuntimeOptions,
): ForgeRuntime => new ForgeRuntime(options);
