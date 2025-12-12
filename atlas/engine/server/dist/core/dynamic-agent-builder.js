import { randomUUID } from 'node:crypto';
import { BaseAgent } from '../multiAgent/BaseAgent.js';
function formatSystemPrompt(schema) {
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
export function buildDynamicAgentFromSchema(schema) {
    class DynamicAgent extends BaseAgent {
        constructor(options) {
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
            this.schema = schema;
            this.capabilities = [...schema.capabilities];
            this.inputs = { ...schema.inputs };
            this.outputs = { ...schema.outputs };
        }
        async execute(task) {
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
            }
            catch (error) {
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
        async processMessage(message) {
            const result = await this.execute({
                from: message.from,
                content: message.content,
                metadata: message.metadata,
            });
            if (!result) {
                return;
            }
            let reply;
            let metadata;
            if (typeof result === 'string') {
                reply = result;
                metadata = { origin: this.id, agentType: schema.name };
            }
            else {
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
    DynamicAgent.schema = schema;
    return DynamicAgent;
}
