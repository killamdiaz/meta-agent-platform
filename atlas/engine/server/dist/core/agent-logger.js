import { agentBroker } from '../multiAgent/index.js';
const SYSTEM_SENDER = 'system';
export function logAgentEvent(agentId, content, options = {}) {
    if (!agentId) {
        return;
    }
    const payload = {
        from: options.from ?? SYSTEM_SENDER,
        to: options.to ?? agentId,
        type: options.type ?? 'task',
        content,
        metadata: {
            __log: true,
            source: options.from ?? SYSTEM_SENDER,
            ...(options.metadata ?? {}),
        },
    };
    try {
        agentBroker.publish(payload);
    }
    catch (error) {
        console.warn('[agent-logger] failed to publish log event', {
            agentId,
            content,
            error,
        });
    }
}
