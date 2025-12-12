import { randomUUID } from 'node:crypto';
import type { AgentMessage } from '../multiAgent/MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../multiAgent/BaseAgent.js';
import type { AgentSchema } from '../types/agents.js';

export interface DynamicAgentConfig extends Partial<BaseAgentOptions> {
  id?: string;
}

export interface DynamicAgentTask {
  from?: string;
  content: string;
  metadata?: Record<string, unknown>;
  context?: string;
}

type ExecuteResult =
  | void
  | string
  | {
      reply?: string;
      metadata?: Record<string, unknown>;
    };

function formatSystemPrompt(schema: AgentSchema): string {
  const capabilityLine = schema.capabilities.length
    ? `Capabilities: ${schema.capabilities.join(', ')}.`
    : 'Capabilities: autonomous reasoning and collaboration.';
  return [
    `You are ${schema.name}, an autonomous AI agent.`,
    schema.description,
    capabilityLine,
    'Respond with clear, actionable output that satisfies the requested task.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildDynamicAgentFromSchema(schema: AgentSchema) {
  class DynamicAgent extends BaseAgent {
    static readonly schema = schema;

    readonly schema = schema;
    readonly capabilities = [...schema.capabilities];
    readonly inputs = { ...schema.inputs };
    readonly outputs = { ...schema.outputs };

    constructor(options: BaseAgentOptions) {
      super({
        ...options,
        id: options.id ?? randomUUID(),
        name: options.name ?? schema.name,
        role: options.role ?? schema.description ?? schema.name,
        description: options.description ?? schema.description,
        aliases: Array.isArray(options.aliases)
          ? Array.from(new Set([...options.aliases, schema.name]))
          : [schema.name],
      });
    }

    async execute(task: DynamicAgentTask): Promise<ExecuteResult> {
      console.info(`[dynamic-agent:${schema.name}] executing task`, {
        from: task.from ?? 'unknown',
        metadataKeys: Object.keys(task.metadata ?? {}),
      });

      const content = task.content?.trim();
      if (!content) {
        return {
          reply: 'Task payload was empty. Please provide instructions or data to act on.',
        };
      }

      try {
        const reply = await this.generateLLMReply({
          from: task.from ?? 'user',
          content,
          metadata: {
            ...(task.metadata ?? {}),
            schema: this.schema,
          },
          context: task.context,
          systemPrompt: formatSystemPrompt(this.schema),
        });

        return {
          reply,
          metadata: {
            origin: this.id,
            agentType: schema.name,
          },
        };
      } catch (error) {
        console.error(`[dynamic-agent:${schema.name}] execution failed`, error);
        return {
          reply: 'I encountered an unexpected error while processing the request.',
          metadata: {
            origin: this.id,
            agentType: schema.name,
            error: error instanceof Error ? error.message : 'unknown error',
          },
        };
      }
    }

    protected override async processMessage(message: AgentMessage): Promise<void> {
      const result = await this.execute({
        from: message.from,
        content: message.content,
        metadata: message.metadata,
      });

      if (!result) {
        return;
      }

      let reply: string | undefined;
      let metadata: Record<string, unknown> | undefined;

      if (typeof result === 'string') {
        reply = result;
        metadata = { origin: this.id, agentType: schema.name };
      } else {
        reply = result.reply;
        metadata = {
          origin: this.id,
          agentType: schema.name,
          ...(result.metadata ?? {}),
        };
      }

      if (reply) {
        await this.sendMessage(message.from, 'response', reply, metadata);
      }
    }
  }

  return DynamicAgent;
}
