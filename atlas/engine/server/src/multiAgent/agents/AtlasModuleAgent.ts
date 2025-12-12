import type { AgentMessage } from '../MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../BaseAgent.js';

export interface AtlasModuleAgentOptions extends BaseAgentOptions {
  endpoints: string[];
}

type QueryRecord = Record<string, string | number | boolean | undefined>;

export abstract class AtlasModuleAgent extends BaseAgent {
  protected readonly managedEndpoints: string[];

  constructor(options: AtlasModuleAgentOptions) {
    super(options);
    this.managedEndpoints = [...options.endpoints];
  }

  protected getManagedEndpoints(): string[] {
    return [...this.managedEndpoints];
  }

  protected async fetchAtlas<T>(path: string, query?: Record<string, unknown>): Promise<T | null> {
    if (!this.hasAtlasBridge()) {
      this.warnMissingBridge(`GET ${path}`);
      return null;
    }
    try {
      const normalisedQuery = query ? this.normaliseQuery(query) : undefined;
      return await this.callAtlas<T>(path, 'GET', undefined, { query: normalisedQuery });
    } catch (error) {
      this.logAtlasError(error, path, 'GET');
      return null;
    }
  }

  protected async postAtlas<T>(path: string, body: unknown): Promise<T | null> {
    if (!this.hasAtlasBridge()) {
      this.warnMissingBridge(`POST ${path}`);
      return null;
    }
    try {
      return await this.callAtlas<T>(path, 'POST', body);
    } catch (error) {
      this.logAtlasError(error, path, 'POST');
      return null;
    }
  }

  protected async notifyAtlas(type: string, title: string, message: string, context?: Record<string, unknown>) {
    if (!this.hasAtlasBridge()) {
      this.warnMissingBridge('POST /bridge-notify');
      return;
    }
    try {
      await this.callAtlas('/bridge-notify', 'POST', {
        type,
        title,
        message,
        context: {
          agentId: this.id,
          agentName: this.name,
          ...context,
        },
      });
    } catch (error) {
      this.logAtlasError(error, '/bridge-notify', 'POST');
    }
  }

  protected async sendContextResponse(
    to: string,
    payload: unknown,
    content?: string,
    metadata?: Record<string, unknown>,
  ) {
    const responseContent = content ?? this.serialisePayload(payload);
    await this.sendMessage(to, 'task', responseContent, {
      eventType: 'context_response',
      intent: 'context_response',
      payload,
      responder: this.id,
      ...(metadata ?? {}),
    });
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    const eventType = this.getMessageEventType(message);
    if (eventType === 'request_context') {
      await this.handleContextRequest(message);
      return;
    }
    if (eventType === 'context_response') {
      await this.handleContextResponse(message);
      return;
    }
    await this.handleOperationalMessage(message);
  }

  protected abstract handleOperationalMessage(message: AgentMessage): Promise<void>;

  protected abstract handleContextRequest(message: AgentMessage): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async handleContextResponse(_message: AgentMessage): Promise<void> {
    // Default no-op; subclasses can override to incorporate context responses.
  }

  protected missingFields(fields: string[], metadata: Record<string, unknown>): string[] {
    const missing: string[] = [];
    for (const field of fields) {
      if (!(field in metadata) || metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
        missing.push(field);
      }
    }
    return missing;
  }

  private serialisePayload(payload: unknown): string {
    if (payload === undefined || payload === null) {
      return 'No additional context provided.';
    }
    if (typeof payload === 'string') {
      return payload;
    }
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }

  private normaliseQuery(query: Record<string, unknown>): QueryRecord {
    const normalised: QueryRecord = {};
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        normalised[key] = value;
      } else if (Array.isArray(value)) {
        normalised[key] = value.join(',');
      } else if (typeof value === 'object') {
        normalised[key] = JSON.stringify(value);
      } else {
        normalised[key] = String(value);
      }
    }
    return normalised;
  }

  private warnMissingBridge(operation: string) {
    console.warn(`[agent:${this.id}] Atlas bridge not configured; cannot execute ${operation}.`);
  }

  private logAtlasError(error: unknown, path: string, method: string) {
    console.warn(`[agent:${this.id}] Atlas request failed`, {
      method,
      path,
      error,
    });
  }
}
