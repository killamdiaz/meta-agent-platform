const PLATFORM_HINTS = [
    { name: 'GitHub', keywords: ['github', 'repo', 'pull request'], category: 'devops', baseUrl: 'https://api.github.com' },
    { name: 'Jira', keywords: ['jira', 'issue', 'ticket'], category: 'work-management', baseUrl: 'https://your-domain.atlassian.net' },
    { name: 'ServiceNow', keywords: ['servicenow', 'incident'], category: 'itsm', baseUrl: 'https://instance.service-now.com' },
    { name: 'Salesforce', keywords: ['salesforce', 'crm', 'lead'], category: 'crm', baseUrl: 'https://your-domain.my.salesforce.com' },
];
function detectPlatform(prompt) {
    const lower = prompt.toLowerCase();
    const match = PLATFORM_HINTS.find((platform) => platform.keywords.some((kw) => lower.includes(kw)));
    return match ?? { name: 'Custom API', category: 'custom', baseUrl: 'https://api.example.com' };
}
function buildConnector(prompt) {
    const platform = detectPlatform(prompt);
    const slug = platform.name.replace(/\s+/g, '-').toLowerCase();
    const manifest = {
        name: `${platform.name} Connector`,
        version: '0.1.0',
        description: `Generated connector for ${platform.name} based on request: ${prompt.slice(0, 200)}`,
        icon: '',
        publisher: 'atlas-ai',
        category: platform.category,
        auth: {
            type: 'oauth2',
            config: {
                authUrl: `${platform.baseUrl}/oauth/authorize`,
                tokenUrl: `${platform.baseUrl}/oauth/token`,
                scopes: ['read', 'write'],
            },
        },
    };
    const actions = {
        listItems: {
            name: 'List Items',
            method: 'GET',
            path: `${platform.baseUrl}/api/${slug}/items`,
            query: { page: '{{page}}', per_page: '{{perPage}}' },
            headers: { Accept: 'application/json' },
            body: {},
            responseMapping: {
                items: '$.items',
                nextCursor: '$.next',
            },
        },
        createItem: {
            name: 'Create Item',
            method: 'POST',
            path: `${platform.baseUrl}/api/${slug}/items`,
            query: {},
            headers: { 'Content-Type': 'application/json' },
            body: { name: '{{name}}', description: '{{description}}' },
            responseMapping: {
                id: '$.id',
                status: '$.status',
            },
        },
    };
    const triggers = {
        pollingUpdates: {
            name: 'Polling Updates',
            type: 'polling',
            path: `${platform.baseUrl}/api/${slug}/items`,
            poll: {
                path: `${platform.baseUrl}/api/${slug}/items`,
                method: 'GET',
                intervalMs: 60_000,
                cursorPath: '$.cursor',
                sinceParam: 'updated_since',
            },
            responseMapping: {
                items: '$.items',
                cursor: '$.cursor',
            },
        },
    };
    const transforms = {
        normalizeItem: `
      function transform(payload) {
        const items = payload.items || [];
        return items.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
        }));
      }
    `,
    };
    return { manifest, actions, triggers, transforms };
}
export class AIConnectorGenerator {
    constructor(connectorService) {
        this.connectorService = connectorService;
    }
    async generateConnector(tenantId, prompt) {
        const draft = buildConnector(prompt);
        const saved = await this.connectorService.saveDraft(tenantId, draft);
        return { generated: saved, prompt, platform: detectPlatform(prompt) };
    }
}
