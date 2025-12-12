import { AtlasModuleAgent } from './AtlasModuleAgent.js';
const SUMMARY_PATH = '/bridge-user-summary';
export class MemoryGraphAgent extends AtlasModuleAgent {
    constructor(options) {
        super({
            ...options,
            role: options.role ??
                'Atlas Memory Graph Agent',
            description: options.description ??
                'Maintains a shared memory graph for all agents, surfaces historical context, and answers recall requests.',
            endpoints: [SUMMARY_PATH, '/bridge-notify'],
        });
    }
    async handleOperationalMessage(message) {
        const summary = await this.fetchAtlas(SUMMARY_PATH);
        if (!summary) {
            await this.sendMessage(message.from, 'response', 'I could not reach Atlas memory right now. Please try again later.', { intent: 'memory_error' });
            return;
        }
        await this.sendMessage(message.from, 'response', `Here is the latest workspace snapshot:\n${JSON.stringify(summary, null, 2)}`, {
            intent: 'memory_summary',
            payload: summary,
        });
    }
    async handleContextRequest(message) {
        const summary = await this.fetchAtlas(SUMMARY_PATH);
        if (!summary) {
            await this.sendMessage(message.from, 'response', 'Unable to retrieve memory summary at this time.', { intent: 'memory_error' });
            return;
        }
        await this.sendContextResponse(message.from, summary, `Shared memory snapshot prepared for ${message.from}.`, { responder: this.id });
    }
}
