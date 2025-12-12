import { AtlasModuleAgent } from './AtlasModuleAgent.js';
const INVOICES_ENDPOINT = '/bridge-invoices';
const CONTRACTS_ENDPOINT = '/bridge-contracts';
const TASKS_ENDPOINT = '/bridge-tasks';
export class AnalyticsAgent extends AtlasModuleAgent {
    constructor(options) {
        super({
            ...options,
            role: options.role ?? 'Atlas Analytics Agent',
            description: options.description ??
                'Aggregates KPIs across tasks, invoices, and contracts. Supplies workspace analytics to other agents.',
            endpoints: [INVOICES_ENDPOINT, CONTRACTS_ENDPOINT, TASKS_ENDPOINT, '/bridge-notify'],
        });
    }
    async handleOperationalMessage(message) {
        const [invoices, contracts, tasks] = await Promise.all([
            this.fetchAtlas(INVOICES_ENDPOINT, { limit: 25 }),
            this.fetchAtlas(CONTRACTS_ENDPOINT, { limit: 25 }),
            this.fetchAtlas(TASKS_ENDPOINT, { limit: 25 }),
        ]);
        if (!invoices && !contracts && !tasks) {
            await this.sendMessage(message.from, 'response', 'Analytics sources are unavailable at the moment.', { intent: 'analytics_unavailable' });
            return;
        }
        const report = {
            invoices: invoices?.summary ?? invoices,
            contracts: contracts?.summary ?? contracts,
            tasks: tasks?.summary ?? tasks,
        };
        await this.sendMessage(message.from, 'response', `Workspace analytics snapshot:\n${JSON.stringify(report, null, 2)}`, {
            intent: 'analytics_snapshot',
            payload: report,
        });
        await this.notifyAtlas('analytics_snapshot', 'Analytics Snapshot Generated', `AnalyticsAgent produced a snapshot for ${message.from}`, { report, targetAgent: message.from });
    }
    async handleContextRequest(message) {
        const focus = this.getMessagePayload(message)?.focus;
        if (typeof focus === 'string' && focus.toLowerCase() === 'contracts') {
            const contracts = await this.fetchAtlas(CONTRACTS_ENDPOINT, { limit: 10 });
            if (contracts) {
                await this.sendContextResponse(message.from, contracts, 'Contract analytics ready.', { responder: this.id, focus: 'contracts' });
                return;
            }
        }
        const invoices = await this.fetchAtlas(INVOICES_ENDPOINT, { limit: 10 });
        if (!invoices) {
            await this.sendMessage(message.from, 'response', 'Analytics context query failed.', { intent: 'analytics_context_unavailable' });
            return;
        }
        await this.sendContextResponse(message.from, invoices, 'Invoice analytics prepared.', { responder: this.id, focus: 'invoices' });
    }
}
