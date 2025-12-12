import { AtlasModuleAgent } from './AtlasModuleAgent.js';
const FETCH_STATUS_ENDPOINT = '/fetch-status';
export class MetaControllerAgent extends AtlasModuleAgent {
    constructor(options) {
        super({
            ...options,
            role: options.role ?? 'Atlas Meta-Controller Agent',
            description: options.description ??
                'Supervises multi-agent health, runs heartbeat checks, and coordinates resets when context drift is detected.',
            endpoints: [FETCH_STATUS_ENDPOINT, '/bridge-user-summary', '/bridge-notify'],
        });
    }
    async handleOperationalMessage(message) {
        const status = await this.fetchAtlas(FETCH_STATUS_ENDPOINT);
        if (!status) {
            await this.sendMessage(message.from, 'response', 'Unable to reach the Atlas status endpoint.', { intent: 'meta_status_unavailable' });
            return;
        }
        await this.sendMessage(message.from, 'response', `Current Atlas status:\n${JSON.stringify(status, null, 2)}`, {
            intent: 'meta_status_report',
            payload: status,
        });
        if (this.detectContextInconsistency(status)) {
            await this.requestHelp('MemoryGraphAgent', {
                query: 'Reload latest context snapshot to resolve inconsistency.',
                requester: this.id,
                messageId: message.id,
            });
            await this.notifyAtlas('meta_controller_alert', 'Context Inconsistency Detected', 'Meta-Controller requested fresh context from MemoryGraphAgent.', { status });
        }
    }
    async handleContextRequest(message) {
        const summary = await this.fetchAtlas('/bridge-user-summary');
        if (!summary) {
            await this.sendMessage(message.from, 'response', 'Unable to retrieve workspace summary.', { intent: 'meta_summary_unavailable' });
            return;
        }
        await this.sendContextResponse(message.from, summary, 'Workspace summary prepared.', { responder: this.id });
    }
    detectContextInconsistency(status) {
        if (typeof status.contextDrift === 'boolean') {
            return status.contextDrift;
        }
        if (typeof status.health === 'string' && status.health.toLowerCase().includes('degraded')) {
            return true;
        }
        return false;
    }
}
