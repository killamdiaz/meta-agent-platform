import { BaseAgent } from '../../multiAgent/BaseAgent.js';
import { createNotionClientFromConfig } from './NotionClient.js';
export class NotionAgent extends BaseAgent {
    constructor({ config, ...baseOptions }) {
        const role = baseOptions.role?.trim() || 'Knowledge Curator';
        const description = baseOptions.description ??
            'Notion integration agent. Archives summaries and creates structured notes for downstream workflows.';
        super({
            ...baseOptions,
            role,
            description,
        });
        this.notion = createNotionClientFromConfig(config);
        this.startAutonomy(20000);
    }
    async processMessage(message) {
        if (message.type === 'task' || message.type === 'response') {
            await this.captureNote(message);
            return;
        }
        await this.sendMessage(message.from, 'response', 'Notion agent standing by to capture structured notes.');
    }
    async think() {
        const recent = await this.notion.queryRecent(3);
        if (!recent.length)
            return;
        await this.sendMessage('*', 'question', `Reviewed ${recent.length} Notion entries. Any follow-ups required?`, {
            origin: this.id,
            autonomy: {
                askAgents: ['MemoryAgent'],
            },
        });
    }
    async captureNote(message) {
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
