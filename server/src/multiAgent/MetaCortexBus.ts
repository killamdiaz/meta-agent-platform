import { MessageBroker, type AgentMessage } from './MessageBroker.js';
import { MemoryService } from '../services/MemoryService.js';
import {
  AtlasBridgeClient,
  type AtlasBridgeClientOptions,
} from '../core/atlas/BridgeClient.js';

type ContextEventType = 'request_context' | 'context_response';

interface ContextEventMetadata {
  eventType: ContextEventType;
  payload?: unknown;
  intent?: string;
}

interface NotificationConfig extends Omit<AtlasBridgeClientOptions, 'defaultCacheTtlMs'> {
  defaultCacheTtlMs?: number;
}

interface MetaCortexBusOptions {
  memoryAgentId?: string;
  notification?: NotificationConfig;
}

interface ContextEventRecord {
  type: ContextEventType;
  payload?: unknown;
}

export class MetaCortexBus {
  private readonly memoryAgentId: string;
  private readonly notificationClient: AtlasBridgeClient | null;
  private readonly unsubscribe: () => void;

  constructor(private readonly broker: MessageBroker, options: MetaCortexBusOptions = {}) {
    this.memoryAgentId = options.memoryAgentId ?? 'meta-cortex';
    this.notificationClient = options.notification
      ? new AtlasBridgeClient({
          ...options.notification,
          defaultCacheTtlMs: options.notification.defaultCacheTtlMs ?? 0,
        })
      : null;
    this.unsubscribe = this.broker.onMessage((message) => {
      void this.handleMessage(message);
    });
  }

  dispose() {
    this.unsubscribe?.();
  }

  private async handleMessage(message: AgentMessage) {
    const contextEvent = this.extractContextEvent(message);
    if (!contextEvent) {
      return;
    }

    try {
      await this.persistContextEvent(message, contextEvent);
    } catch (error) {
      console.warn('[meta-cortex-bus] failed to persist context event', {
        messageId: message.id,
        error,
      });
    }

    if (this.notificationClient) {
      try {
        await this.dispatchNotification(message, contextEvent);
      } catch (error) {
        console.warn('[meta-cortex-bus] failed to notify Atlas Bridge', {
          messageId: message.id,
          error,
        });
      }
    }
  }

  private extractContextEvent(message: AgentMessage): ContextEventRecord | null {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const rawType = metadata.eventType ?? metadata.intent;
    if (typeof rawType !== 'string') {
      return null;
    }
    const eventType = rawType.trim().toLowerCase();
    if (eventType !== 'request_context' && eventType !== 'context_response') {
      return null;
    }
    return {
      type: eventType,
      payload: metadata.payload,
    } as ContextEventRecord;
  }

  private async persistContextEvent(message: AgentMessage, contextEvent: ContextEventRecord) {
    const summary = this.composeSummary(message, contextEvent.type);
    await MemoryService.addMemory(this.memoryAgentId, summary, {
      eventType: contextEvent.type,
      from: message.from,
      to: message.to,
      payload: contextEvent.payload,
      messageId: message.id,
      timestamp: message.timestamp,
    });
  }

  private composeSummary(message: AgentMessage, type: ContextEventType): string {
    const direction = type === 'request_context' ? 'requested context from' : 'supplied context to';
    const trimmedContent = message.content.trim();
    const excerpt = trimmedContent.length > 160 ? `${trimmedContent.slice(0, 157)}...` : trimmedContent;
    return `[${type}] ${message.from} ${direction} ${message.to}: ${excerpt || '(no content)'}`;
  }

  private async dispatchNotification(message: AgentMessage, contextEvent: ContextEventRecord) {
    if (!this.notificationClient) return;
    const content = message.content.trim();
    const body = {
      type: 'agent_event',
      title:
        contextEvent.type === 'request_context'
          ? 'Agent requested additional context'
          : 'Agent supplied requested context',
      message: this.composeNotificationMessage(message.from, message.to, content),
      context: {
        eventType: contextEvent.type,
        from: message.from,
        to: message.to,
        payload: contextEvent.payload,
        metadata: message.metadata,
        messageId: message.id,
        timestamp: message.timestamp,
      },
    };
    await this.notificationClient.request({
      path: '/bridge-notify',
      method: 'POST',
      body,
      skipCache: true,
      logMessage: '[meta-cortex-bus] notifying Atlas Bridge of context event',
    });
  }

  private composeNotificationMessage(from: string, to: string, content: string): string {
    const trimmed = content.trim();
    const excerpt = trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed || '(no content)';
    return `${from} → ${to}: ${excerpt}`;
  }
}
