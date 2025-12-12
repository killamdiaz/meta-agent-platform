import { MemoryService } from '../services/MemoryService.js';
import { AtlasBridgeClient, } from '../core/atlas/BridgeClient.js';
export class MetaCortexBus {
    constructor(broker, options = {}) {
        this.broker = broker;
        this.memoryAgentId = options.memoryAgentId ?? 'meta-cortex';
        this.notificationClient = options.notification
            ? new AtlasBridgeClient({
                ...options.notification,
                defaultCacheTtlMs: options.notification.defaultCacheTtlMs ?? 0,
            })
            : null;
        this.unsubscribe = this.broker.onMessage((message) => {
            void this.handleMessage(message);
        });
    }
    dispose() {
        this.unsubscribe?.();
    }
    async handleMessage(message) {
        const contextEvent = this.extractContextEvent(message);
        if (!contextEvent) {
            return;
        }
        try {
            await this.persistContextEvent(message, contextEvent);
        }
        catch (error) {
            console.warn('[meta-cortex-bus] failed to persist context event', {
                messageId: message.id,
                error,
            });
        }
        if (this.notificationClient) {
            try {
                await this.dispatchNotification(message, contextEvent);
            }
            catch (error) {
                console.warn('[meta-cortex-bus] failed to notify Atlas Bridge', {
                    messageId: message.id,
                    error,
                });
            }
        }
    }
    extractContextEvent(message) {
        const metadata = (message.metadata ?? {});
        const rawType = metadata.eventType ?? metadata.intent;
        if (typeof rawType !== 'string') {
            return null;
        }
        const eventType = rawType.trim().toLowerCase();
        if (eventType !== 'request_context' && eventType !== 'context_response') {
            return null;
        }
        return {
            type: eventType,
            payload: metadata.payload,
        };
    }
    async persistContextEvent(message, contextEvent) {
        const summary = this.composeSummary(message, contextEvent.type);
        await MemoryService.addMemory(this.memoryAgentId, summary, {
            eventType: contextEvent.type,
            from: message.from,
            to: message.to,
            payload: contextEvent.payload,
            messageId: message.id,
            timestamp: message.timestamp,
        });
    }
    composeSummary(message, type) {
        const direction = type === 'request_context' ? 'requested context from' : 'supplied context to';
        const trimmedContent = message.content.trim();
        const excerpt = trimmedContent.length > 160 ? `${trimmedContent.slice(0, 157)}...` : trimmedContent;
        return `[${type}] ${message.from} ${direction} ${message.to}: ${excerpt || '(no content)'}`;
    }
    async dispatchNotification(message, contextEvent) {
        if (!this.notificationClient)
            return;
        const content = message.content.trim();
        const body = {
            type: 'agent_event',
            title: contextEvent.type === 'request_context'
                ? 'Agent requested additional context'
                : 'Agent supplied requested context',
            message: this.composeNotificationMessage(message.from, message.to, content),
            context: {
                eventType: contextEvent.type,
                from: message.from,
                to: message.to,
                payload: contextEvent.payload,
                metadata: message.metadata,
                messageId: message.id,
                timestamp: message.timestamp,
            },
        };
        await this.notificationClient.request({
            path: '/bridge-notify',
            method: 'POST',
            body,
            skipCache: true,
            logMessage: '[meta-cortex-bus] notifying Atlas Bridge of context event',
        });
    }
    composeNotificationMessage(from, to, content) {
        const trimmed = content.trim();
        const excerpt = trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed || '(no content)';
        return `${from} → ${to}: ${excerpt}`;
    }
}
