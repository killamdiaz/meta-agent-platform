import OpenAI from 'openai';
import { config } from '../config.js';
import { MemoryService } from '../services/MemoryService.js';

const openai = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  status: string;
  objectives: unknown;
  memory_context: string;
  tools: Record<string, unknown>;
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

  async loadMemory() {
    return this.memoryService.listMemories(this.id, 5);
  }

  async think(prompt: string) {
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
      return [`Thought from ${this.name}:`, prompt, context].filter(Boolean).join('\n');
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages,
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
}
