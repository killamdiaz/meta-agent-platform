import { AtlasBridgeClient, ATLAS_BRIDGE_DEFAULT_BASE_URL } from '../core/atlas/BridgeClient.js';
const ENV_BASE_URL = typeof process !== 'undefined' ? process.env?.ATLAS_BRIDGE_BASE_URL?.trim() : '';
const clientRegistry = new Map();
export { AtlasBridgeError, generateSignature } from '../core/atlas/BridgeClient.js';
function resolveBaseUrl(candidate) {
    const provided = candidate?.trim();
    if (provided && provided.length > 0) {
        return provided.endsWith('/') ? provided.slice(0, -1) : provided;
    }
    if (ENV_BASE_URL && ENV_BASE_URL.length > 0) {
        return ENV_BASE_URL.endsWith('/') ? ENV_BASE_URL.slice(0, -1) : ENV_BASE_URL;
    }
    return ATLAS_BRIDGE_DEFAULT_BASE_URL;
}
function getClient(credentials) {
    const baseUrl = resolveBaseUrl(credentials.baseUrl);
    const ttlKey = credentials.defaultCacheTtlMs !== undefined ? String(credentials.defaultCacheTtlMs) : 'default';
    const key = `${credentials.agentId}:${credentials.secret}:${baseUrl}:${ttlKey}`;
    let client = clientRegistry.get(key);
    if (!client) {
        client = new AtlasBridgeClient({
            agentId: credentials.agentId,
            secret: credentials.secret,
            baseUrl,
            token: credentials.token,
            tokenProvider: credentials.refreshToken,
            defaultCacheTtlMs: credentials.defaultCacheTtlMs,
        });
        clientRegistry.set(key, client);
        return client;
    }
    if (credentials.token) {
        client.setToken(credentials.token);
    }
    if (credentials.refreshToken) {
        client.setTokenProvider(credentials.refreshToken);
    }
    return client;
}
export async function getUserSummary(params) {
    const client = getClient(params);
    return client.request({
        path: '/bridge-user-summary',
        method: 'GET',
    });
}
export async function getContracts(params) {
    const client = getClient(params);
    return client.request({
        path: '/bridge-contracts',
        method: 'GET',
        query: {
            status: params.status,
            limit: params.limit,
        },
    });
}
export async function createContract(params) {
    const { body, ...credentials } = params;
    const client = getClient(credentials);
    return client.request({
        path: '/bridge-contracts',
        method: 'POST',
        body,
        logMessage: 'Creating contract...',
    });
}
export async function getInvoices(params) {
    const client = getClient(params);
    return client.request({
        path: '/bridge-invoices',
        method: 'GET',
        query: {
            limit: params.limit,
        },
    });
}
export async function createTask(params) {
    const { body, ...credentials } = params;
    const client = getClient(credentials);
    return client.request({
        path: '/bridge-tasks',
        method: 'POST',
        body,
        logMessage: 'Creating task...',
    });
}
export async function sendNotification(params) {
    const { body, ...credentials } = params;
    const client = getClient(credentials);
    return client.request({
        path: '/bridge-notify',
        method: 'POST',
        body,
        logMessage: 'Sending notification...',
    });
}
