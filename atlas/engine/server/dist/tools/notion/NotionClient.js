import { Client } from '@notionhq/client';
export class NotionClient {
    constructor(config) {
        if (!config.token) {
            throw new Error('Notion integration token is required');
        }
        this.client = new Client({ auth: config.token });
        this.databaseId = config.databaseId;
    }
    async createNote(title, content) {
        if (!this.databaseId) {
            throw new Error('Notion database ID is required to create notes');
        }
        await this.client.pages.create({
            parent: { database_id: this.databaseId },
            properties: {
                Name: {
                    title: [{ text: { content: title } }],
                },
            },
            children: [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ type: 'text', text: { content } }],
                    },
                },
            ],
        });
    }
    async queryRecent(limit = 5) {
        if (!this.databaseId) {
            return [];
        }
        const response = await this.client.databases.query({
            database_id: this.databaseId,
            page_size: limit,
            sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        });
        return response.results;
    }
}
export function createNotionClientFromConfig(values) {
    const token = typeof values.notionToken === 'string' ? values.notionToken : '';
    const databaseId = typeof values.databaseId === 'string' ? values.databaseId : undefined;
    return new NotionClient({ token, databaseId });
}
