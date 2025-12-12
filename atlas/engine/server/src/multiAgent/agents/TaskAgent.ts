import type { AgentMessage } from '../MessageBroker.js';
import { AtlasModuleAgent, type AtlasModuleAgentOptions } from './AtlasModuleAgent.js';

const TASKS_ENDPOINT = '/bridge-tasks';

export interface TaskAgentOptions extends Omit<AtlasModuleAgentOptions, 'endpoints'> {}

interface TaskPayload {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  client?: string;
  invoiceId?: string;
}

export class TaskAgent extends AtlasModuleAgent {
  private readonly pendingTasks = new Map<string, { payload: TaskPayload; title: string; requester: string }>();

  constructor(options: TaskAgentOptions) {
    super({
      ...options,
      role: options.role ?? 'Atlas Task Agent',
      description:
        options.description ??
        'Creates and synchronises tasks with Atlas OS. Coordinates with Finance and Email agents when more context is required.',
      endpoints: [TASKS_ENDPOINT, '/bridge-invoices', '/bridge-notify'],
    });
  }

  protected override async handleOperationalMessage(message: AgentMessage): Promise<void> {
    const payload = this.extractTaskPayload(message);
    const title = payload.title?.trim() || message.content.trim();

    if (!title) {
      await this.sendMessage(
        message.from,
        'response',
        'I need a task title or description before I can create something in Atlas.',
        { intent: 'task_missing_title' },
      );
      return;
    }

    const missing = [];
    if (!payload.client) {
      missing.push('client');
    }
    if (missing.length > 0) {
      this.pendingTasks.set(message.id, { payload: { ...payload, title }, title, requester: message.from });
      await this.requestHelp('FinanceAgent', {
        query: `client contact for task "${title}"`,
        missing,
        requester: this.id,
        messageId: message.id,
      });
      await this.sendMessage(
        message.from,
        'response',
        'I asked FinanceAgent for the missing client details before creating the task.',
        {
          intent: 'task_pending_context',
          missing,
        },
      );
      return;
    }

    await this.createTaskEntry(title, payload, message.from, message.id, message.content.trim());
  }

  protected override async handleContextRequest(message: AgentMessage): Promise<void> {
    const limit =
      (typeof message.metadata?.limit === 'number' && Number.isFinite(message.metadata.limit)
        ? message.metadata.limit
        : 5) || 5;
    const tasks = await this.fetchAtlas<Record<string, unknown>>(TASKS_ENDPOINT, { limit });
    if (!tasks) {
      await this.sendMessage(
        message.from,
        'response',
        'I could not retrieve recent tasks from Atlas.',
        { intent: 'task_fetch_failed' },
      );
      return;
    }
    await this.sendContextResponse(
      message.from,
      tasks,
      `Latest ${limit} tasks retrieved for ${message.from}.`,
      { responder: this.id },
    );
  }

  protected override async handleContextResponse(message: AgentMessage): Promise<void> {
    const payload = this.getMessagePayload<Record<string, unknown>>(message) ?? {};
    const respondingTo =
      typeof payload.messageId === 'string'
        ? payload.messageId
        : typeof message.metadata?.respondingTo === 'string'
          ? message.metadata.respondingTo
          : undefined;
    if (!respondingTo) {
      return;
    }
    const pending = this.pendingTasks.get(respondingTo);
    if (!pending) {
      return;
    }

    const updatedPayload: TaskPayload = {
      ...pending.payload,
      client: typeof payload.client === 'string' ? payload.client : pending.payload.client,
      dueDate:
        pending.payload.dueDate ??
        (typeof payload.dueDate === 'string' ? payload.dueDate : undefined),
      priority:
        pending.payload.priority ??
        (typeof payload.priority === 'string' ? payload.priority : undefined),
    };
    this.pendingTasks.delete(respondingTo);

    await this.createTaskEntry(pending.title, updatedPayload, pending.requester, respondingTo);
  }

  private extractTaskPayload(message: AgentMessage): TaskPayload {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const direct = this.coerceRecord(metadata.task);
    if (direct) {
      return direct as TaskPayload;
    }
    const payload = this.getMessagePayload<Record<string, unknown>>(message);
    const embedded = this.coerceRecord(payload?.task ?? payload);
    if (embedded) {
      return embedded as TaskPayload;
    }
    return {};
  }

  private coerceRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private async createTaskEntry(
    title: string,
    payload: TaskPayload,
    requester: string,
    sourceMessageId?: string,
    fallbackDescription?: string,
  ): Promise<void> {
    if (!payload.client) {
      await this.sendMessage(
        requester,
        'response',
        'Still missing client details; unable to create the task.',
        { intent: 'task_missing_context', payload },
      );
      return;
    }

    const taskBody = {
      title,
      description: payload.description ?? fallbackDescription ?? title,
      dueDate: payload.dueDate,
      priority: payload.priority ?? 'medium',
      client: payload.client,
      source: payload.invoiceId ? `invoice:${payload.invoiceId}` : 'agent-task',
    };

    const created = await this.postAtlas<{ taskId?: string; status?: string }>(TASKS_ENDPOINT, taskBody);
    if (!created) {
      await this.sendMessage(
        requester,
        'response',
        'Atlas task creation failed. Please retry later.',
        { intent: 'task_creation_failed', payload: taskBody },
      );
      return;
    }

    await this.sendMessage(
      requester,
      'response',
      `Task created in Atlas (id: ${created.taskId ?? 'unknown'}).`,
      {
        intent: 'task_created',
        payload: created,
      },
    );

    await this.notifyAtlas(
      'task_created',
      'Task Created',
      `Task "${taskBody.title}" created by ${this.name}`,
      { task: created, sourceMessage: sourceMessageId },
    );
  }
}
