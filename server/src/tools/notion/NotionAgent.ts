import type { AgentMessage } from '../../multiAgent/MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../../multiAgent/BaseAgent.js';
import { NotionClient, createNotionClientFromConfig } from './NotionClient.js';

interface NotionAgentOptions extends BaseAgentOptions {
  config: Record<string, unknown>;
}

export class NotionAgent extends BaseAgent {
  private readonly notion: NotionClient;

  constructor({ config, ...baseOptions }: NotionAgentOptions) {
    const role = baseOptions.role?.trim() || 'Knowledge Curator';
    const description =
      baseOptions.description ??
      'Notion integration agent. Archives summaries and creates structured notes for downstream workflows.';
    super({
      ...baseOptions,
      role,
      description,
    });
    this.notion = createNotionClientFromConfig(config);
    this.startAutonomy(20000);
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'task' || message.type === 'response') {
      await this.captureNote(message);
      return;
    }
    await this.sendMessage(message.from, 'response', 'Notion agent standing by to capture structured notes.');
  }

  protected override async think(): Promise<void> {
    const recent = await this.notion.queryRecent(3);
    if (!recent.length) return;
    await this.sendMessage('*', 'question', `Reviewed ${recent.length} Notion entries. Any follow-ups required?`, {
      origin: this.id,
      autonomy: {
        askAgents: ['MemoryAgent'],
      },
    });
  }

  private async captureNote(message: AgentMessage) {
    const metadata = message.metadata ?? {};
    const title = typeof metadata.title === 'string' ? metadata.title : `Update from ${message.from}`;
    const content = message.content;
    await this.notion.createNote(title, content);
    await this.sendMessage(message.from, 'response', `Stored note in Notion: ${title}`, {
      origin: this.id,
      status: 'stored',
    });
  }
}
