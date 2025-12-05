import type { ConnectorContext, ConnectorName, ConnectorQueryResponse } from '../connectors/types';
import type { AuthManager } from '../utils/AuthManager';

export type ForgeConnectorName = ConnectorName | (string & {});

export interface ForgePlanStep {
  id: string;
  title?: string;
  connector: ForgeConnectorName;
  action: string;
  params?: Record<string, unknown>;
  context?: ConnectorContext;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

export interface ForgePlan {
  id: string;
  steps: ForgePlanStep[];
  metadata?: Record<string, unknown>;
}

export type ForgeJobStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'skipped';

export interface ForgeJob {
  id: string;
  connector: ForgeConnectorName;
  action: string;
  params?: Record<string, unknown>;
  context?: ConnectorContext;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
  status: ForgeJobStatus;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface ForgeJobResult {
  jobId: string;
  connector: ForgeConnectorName;
  action: string;
  status: ForgeJobStatus;
  attempts: number;
  startedAt: string;
  finishedAt: string;
  data?: ConnectorQueryResponse;
  error?: {
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

export interface ForgeExecutionResult {
  planId: string;
  status: 'success' | 'partial' | 'failed';
  results: ForgeJobResult[];
  metadata?: Record<string, unknown>;
}

export interface RateLimiterConfig {
  requests: number;
  intervalMs: number;
  maxQueue?: number;
}

export interface RetryStrategyConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitter?: number;
}

export interface ConnectorExecutionConfig {
  rateLimit?: RateLimiterConfig;
  retry?: RetryStrategyConfig;
}

export interface ForgeRuntimeOptions {
  maxConcurrentJobs?: number;
  defaultRetry?: RetryStrategyConfig;
  telemetry?: {
    emit: (event: ForgeTelemetryEvent) => void;
  };
  authManager?: AuthManager;
}

export type ForgeTelemetryEvent =
  | {
      type: 'job_queued';
      payload: { job: ForgeJob };
    }
  | {
      type: 'job_started';
      payload: { job: ForgeJob };
    }
  | {
      type: 'job_finished';
      payload: { result: ForgeJobResult };
    }
  | {
      type: 'job_failed';
      payload: { job: ForgeJob; error: Error; attempt: number };
    }
  | {
      type: 'plan_completed';
      payload: { result: ForgeExecutionResult };
    };
