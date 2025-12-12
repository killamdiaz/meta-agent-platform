import { MemoryService } from '../services/MemoryService.js';
import { internetAccessModule, type FetchOptions, type FetchResult, type SearchResult } from '../services/InternetAccessModule.js';
import { MailQueueService } from '../services/MailQueueService.js';
import { metaController } from './MetaController.js';
import type { AgentConfigField } from '../services/AgentConfigService.js';
import { routeMessage } from '../llm/router.js';

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  status: string;
  objectives: unknown;
  memory_context: string;
  tools: Record<string, unknown>;
  internet_access_enabled: boolean;
  settings: Record<string, unknown>;
  agent_type?: string | null;
  config_schema?: AgentConfigField[] | null;
  config_data?: Record<string, unknown> | null;
  config_summary?: string | null;
  created_at: string;
  updated_at: string;
}

export class Agent {
  constructor(
    public readonly record: AgentRecord,
    private readonly memoryService = MemoryService
  ) {}

  get id() {
    return this.record.id;
  }

  get name() {
    return this.record.name;
  }

  get role() {
    return this.record.role;
  }

  get tools() {
    return this.record.tools;
  }

  get internetEnabled() {
    return Boolean(this.record.internet_access_enabled);
  }

  get settings() {
    return this.record.settings ?? {};
  }

  get configuration() {
    return this.record.config_data ?? {};
  }

  get configurationSchema(): AgentConfigField[] {
    return Array.isArray(this.record.config_schema)
      ? (this.record.config_schema as AgentConfigField[])
      : [];
  }

  get agentType() {
    return this.record.agent_type ?? this.record.role;
  }

  async loadMemory() {
    return this.memoryService.listMemories(this.id, 5);
  }

  async think(prompt: string, onToken?: (token: string) => void) {
    const latestMemories = await this.loadMemory();
    const context = latestMemories.map((memory) => memory.content).join('\n');
    const systemContext = [
      `You are ${this.name}, a ${this.role}.`,
      'You have access to both short-term and long-term memories supplied via the conversation context.',
      'Use those memories to inform answers, reference prior facts when helpful, and never claim you lack memory when relevant information is provided.',
      'If the supplied memories do not contain the answer, simply reason it out or ask clarifying questions—do not disclaim an inability to remember.',
    ].join(' ');

    if (onToken) {
      let final = '';
      await routeMessage({
        prompt,
        context: `${systemContext}\n\nMemories:\n${context}`,
        intent: 'agent_think',
        stream: true,
        onToken: (token) => {
          final += token;
          onToken(token);
        },
      });
      return final.trim();
    }

    const content = await routeMessage({
      prompt,
      context: `${systemContext}\n\nMemories:\n${context}`,
      intent: 'agent_think',
    });
    return content;
  }

  async act(task: { id: string; prompt: string }, result: string) {
    const summary = result.slice(0, 400);
    await this.memoryService.addMemory(this.id, summary, {
      taskId: task.id,
      prompt: task.prompt,
      savedAt: new Date().toISOString()
    });
    return { summary };
  }

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    if (!this.internetEnabled) {
      throw new Error(`Agent ${this.name} does not have internet access enabled.`);
    }

    const result = await internetAccessModule.fetch(url, { summarize: true, cite: true, ...options });
    await metaController.recordCollaboration(this.id, await metaController.getMetaAgentId(), null, `Fetched ${url}`);
    return result;
  }

  async webSearch(query: string): Promise<SearchResult[]> {
    if (!this.internetEnabled) {
      throw new Error(`Agent ${this.name} does not have internet access enabled.`);
    }

    const results = await internetAccessModule.webSearch(query);
    await metaController.recordCollaboration(this.id, await metaController.getMetaAgentId(), null, `Search for "${query}"`);
    return results;
  }

  async mail(payload: { to: string; subject: string; html: string }) {
    const approval = await metaController.requestApproval(this.id, 'send_mail', {
      to: payload.to,
      subject: payload.subject,
    });

    if (approval.status !== 'approved') {
      return {
        status: 'pending',
        approvalId: approval.id,
        message: 'Email requires user approval before being sent.',
      };
    }

    const queued = await MailQueueService.enqueue({ agentId: this.id, ...payload });
    await metaController.recordCollaboration(this.id, await metaController.getMetaAgentId(), null, `Queued email ${queued.id}`);
    if (queued.status === 'queued') {
      await MailQueueService.processPending(1);
    }
    return {
      status: 'queued',
      messageId: queued.id,
    };
  }
}
