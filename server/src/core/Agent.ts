import OpenAI from 'openai';
import { config } from '../config.js';
import { MemoryService } from '../services/MemoryService.js';
import { internetAccessModule, type FetchOptions, type FetchResult, type SearchResult } from '../services/InternetAccessModule.js';
import { MailQueueService } from '../services/MailQueueService.js';
import { metaController } from './MetaController.js';
import type { AgentConfigField } from '../services/AgentConfigService.js';

const openai = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;

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
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: `You are ${this.name}, a ${this.role}.` },
      { role: 'user', content: prompt }
    ];
    if (context) {
      messages.push({ role: 'assistant', content: context });
    }

    if (!openai) {
      const fallback = [`Thought from ${this.name}:`, prompt, context].filter(Boolean).join('\n');
      if (onToken) {
        onToken(fallback);
      }
      return fallback;
    }

    if (onToken) {
      const stream = await openai.chat.completions.create({
        model: 'gpt-5',
        messages,
        stream: true
      });
      let final = '';
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content ?? '';
        if (!token) {
          continue;
        }
        final += token;
        onToken(token);
      }
      return final.trim();
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages
    });
    const content = response.choices[0]?.message?.content ?? '';
    return content.trim();
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
