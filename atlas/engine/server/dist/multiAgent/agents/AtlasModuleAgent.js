import { BaseAgent } from '../BaseAgent.js';
export class AtlasModuleAgent extends BaseAgent {
    constructor(options) {
        super(options);
        this.managedEndpoints = [...options.endpoints];
    }
    getManagedEndpoints() {
        return [...this.managedEndpoints];
    }
    async fetchAtlas(path, query) {
        if (!this.hasAtlasBridge()) {
            this.warnMissingBridge(`GET ${path}`);
            return null;
        }
        try {
            const normalisedQuery = query ? this.normaliseQuery(query) : undefined;
            return await this.callAtlas(path, 'GET', undefined, { query: normalisedQuery });
        }
        catch (error) {
            this.logAtlasError(error, path, 'GET');
            return null;
        }
    }
    async postAtlas(path, body) {
        if (!this.hasAtlasBridge()) {
            this.warnMissingBridge(`POST ${path}`);
            return null;
        }
        try {
            return await this.callAtlas(path, 'POST', body);
        }
        catch (error) {
            this.logAtlasError(error, path, 'POST');
            return null;
        }
    }
    async notifyAtlas(type, title, message, context) {
        if (!this.hasAtlasBridge()) {
            this.warnMissingBridge('POST /bridge-notify');
            return;
        }
        try {
            await this.callAtlas('/bridge-notify', 'POST', {
                type,
                title,
                message,
                context: {
                    agentId: this.id,
                    agentName: this.name,
                    ...context,
                },
            });
        }
        catch (error) {
            this.logAtlasError(error, '/bridge-notify', 'POST');
        }
    }
    async sendContextResponse(to, payload, content, metadata) {
        const responseContent = content ?? this.serialisePayload(payload);
        await this.sendMessage(to, 'task', responseContent, {
            eventType: 'context_response',
            intent: 'context_response',
            payload,
            responder: this.id,
            ...(metadata ?? {}),
        });
    }
    async processMessage(message) {
        const eventType = this.getMessageEventType(message);
        if (eventType === 'request_context') {
            await this.handleContextRequest(message);
            return;
        }
        if (eventType === 'context_response') {
            await this.handleContextResponse(message);
            return;
        }
        await this.handleOperationalMessage(message);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async handleContextResponse(_message) {
        // Default no-op; subclasses can override to incorporate context responses.
    }
    missingFields(fields, metadata) {
        const missing = [];
        for (const field of fields) {
            if (!(field in metadata) || metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
                missing.push(field);
            }
        }
        return missing;
    }
    serialisePayload(payload) {
        if (payload === undefined || payload === null) {
            return 'No additional context provided.';
        }
        if (typeof payload === 'string') {
            return payload;
        }
        try {
            return JSON.stringify(payload, null, 2);
        }
        catch {
            return String(payload);
        }
    }
    normaliseQuery(query) {
        const normalised = {};
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null)
                continue;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                normalised[key] = value;
            }
            else if (Array.isArray(value)) {
                normalised[key] = value.join(',');
            }
            else if (typeof value === 'object') {
                normalised[key] = JSON.stringify(value);
            }
            else {
                normalised[key] = String(value);
            }
        }
        return normalised;
    }
    warnMissingBridge(operation) {
        console.warn(`[agent:${this.id}] Atlas bridge not configured; cannot execute ${operation}.`);
    }
    logAtlasError(error, path, method) {
        console.warn(`[agent:${this.id}] Atlas request failed`, {
            method,
            path,
            error,
        });
    }
}
