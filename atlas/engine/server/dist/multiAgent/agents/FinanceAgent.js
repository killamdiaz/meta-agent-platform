import { AtlasModuleAgent } from './AtlasModuleAgent.js';
const INVOICES_ENDPOINT = '/bridge-invoices';
const CONTRACTS_ENDPOINT = '/bridge-contracts';
export class FinanceAgent extends AtlasModuleAgent {
    constructor(options) {
        super({
            ...options,
            role: options.role ?? 'Atlas Finance Agent',
            description: options.description ??
                'Monitors invoices, contracts, and financial signals. Escalates overdue items and collaborates with TaskAgent.',
            endpoints: [INVOICES_ENDPOINT, CONTRACTS_ENDPOINT, '/bridge-notify'],
        });
    }
    async handleOperationalMessage(message) {
        const invoices = await this.fetchAtlas(INVOICES_ENDPOINT, {
            limit: 10,
        });
        if (!invoices) {
            await this.sendMessage(message.from, 'response', 'Atlas invoice data is unavailable at the moment.', { intent: 'finance_unavailable' });
            return;
        }
        await this.sendMessage(message.from, 'response', `Latest invoices summary:\n${JSON.stringify(invoices.summary ?? invoices, null, 2)}`, {
            intent: 'finance_summary',
            payload: invoices,
        });
        const overdue = this.extractOverdueAmount(invoices);
        if (overdue > 0) {
            await this.requestHelp('TaskAgent', {
                query: `Create follow-up tasks for overdue invoices totalling ${overdue}`,
                amount: overdue,
                requester: this.id,
            });
            await this.notifyAtlas('finance_alert', 'Overdue Invoices', `Detected ${overdue} in overdue invoices`, {
                overdue,
                invoices,
            });
        }
    }
    async handleContextRequest(message) {
        const detail = this.getMessagePayload(message) ?? {};
        if (detail?.subject === 'contracts') {
            const contracts = await this.fetchAtlas(CONTRACTS_ENDPOINT, {
                status: detail.status ?? 'active',
                limit: 10,
            });
            if (!contracts) {
                await this.sendMessage(message.from, 'response', 'Unable to retrieve contract information.', { intent: 'finance_contracts_unavailable' });
                return;
            }
            await this.sendContextResponse(message.from, contracts, 'Contract snapshot prepared.', { responder: this.id, subject: 'contracts' });
            return;
        }
        if (Array.isArray(detail.missing) && detail.missing.includes('client')) {
            const invoices = await this.fetchAtlas(INVOICES_ENDPOINT, { limit: 20 });
            const invoiceList = invoices?.invoices ?? [];
            const clientCandidate = invoiceList.find((invoice) => typeof invoice.client === 'string')?.client;
            const responseMessageId = typeof detail.messageId === 'string' ? detail.messageId : message.id;
            await this.sendContextResponse(message.from, {
                client: clientCandidate ?? 'Client contact not found',
                messageId: responseMessageId,
                source: 'FinanceAgent',
            }, `Provided client context${clientCandidate ? '' : ' (no match located)'}.`, { responder: this.id, respondingTo: responseMessageId });
            return;
        }
        const invoices = await this.fetchAtlas(INVOICES_ENDPOINT, { limit: 10 });
        if (!invoices) {
            await this.sendMessage(message.from, 'response', 'Unable to retrieve invoice information.', { intent: 'finance_context_unavailable' });
            return;
        }
        await this.sendContextResponse(message.from, invoices, 'Invoice snapshot prepared.', { responder: this.id, subject: 'invoices' });
    }
    extractOverdueAmount(invoices) {
        const summary = invoices.summary;
        if (!summary)
            return 0;
        const pending = summary.pending ?? summary.overdue;
        if (typeof pending === 'number') {
            return pending;
        }
        if (typeof pending === 'string') {
            const parsed = Number(pending);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }
}
