import axios from 'axios';
import { URL } from 'url';
import { getJsonPath } from './json-path.js';
import { TransformRunner } from './transform-runner.js';
const RETRYABLE_STATUSES = [429, 500, 502, 503];
function applyTemplate(input, params) {
    if (typeof input === 'string') {
        return input.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
            const value = params[key.trim()];
            return value === undefined || value === null ? '' : String(value);
        });
    }
    if (Array.isArray(input)) {
        return input.map((item) => applyTemplate(item, params));
    }
    if (input && typeof input === 'object') {
        return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, applyTemplate(v, params)]));
    }
    return input;
}
function mapResponse(mapping, payload) {
    const result = {};
    for (const [key, jsonPath] of Object.entries(mapping)) {
        result[key] = getJsonPath(payload, jsonPath);
    }
    return result;
}
export class UniversalConnectorRuntime {
    constructor(vault, client = axios.create()) {
        this.vault = vault;
        this.client = client;
        this.circuitBreaker = new Map();
        this.transformRunner = new TransformRunner();
    }
    async executeAction(params) {
        const { connector, action: actionName, input, tenantId, authKey, transformName } = params;
        this.ensureCircuit(connector.id);
        const action = connector.actions[actionName];
        if (!action) {
            throw new Error(`Action ${actionName} not found for connector ${connector.manifest.name}`);
        }
        const authContext = await this.resolveAuth(connector, tenantId, authKey);
        const request = this.buildRequest(action, input, authContext);
        const attempts = 3;
        let lastError;
        for (let i = 0; i < attempts; i += 1) {
            try {
                const response = await this.client.request(request);
                this.recordSuccess(connector.id);
                const mapped = mapResponse(action.responseMapping, response.data);
                if (transformName && connector.transforms[transformName]) {
                    const transformResult = await this.transformRunner.run(connector.transforms[transformName], mapped);
                    return {
                        connectorId: connector.id,
                        actionName,
                        status: response.status,
                        data: transformResult.output ?? mapped,
                    };
                }
                return { connectorId: connector.id, actionName, status: response.status, data: mapped };
            }
            catch (err) {
                lastError = err;
                const status = err?.response?.status;
                if (status && RETRYABLE_STATUSES.includes(status) && i < attempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
                    continue;
                }
                this.recordFailure(connector.id);
                throw err;
            }
        }
        throw lastError ?? new Error('Unknown connector runtime error');
    }
    buildRequest(action, input, auth) {
        const params = input || {};
        const rawPath = applyTemplate(action.path, params);
        const url = this.buildUrl(rawPath, params.baseUrl);
        const query = applyTemplate(action.query, params);
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.append(key, String(value));
            }
        }
        const headers = applyTemplate(action.headers, params);
        if (auth?.type === 'oauth2' || auth?.type === 'api_key') {
            const headerName = action.authHeader || 'Authorization';
            headers[headerName] = auth.type === 'api_key' ? auth.apiKey : `Bearer ${auth.token}`;
        }
        else if (auth?.type === 'basic' && auth.username && auth.password) {
            const value = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
            headers.Authorization = `Basic ${value}`;
        }
        const body = applyTemplate(action.body, params);
        const request = {
            method: action.method || 'GET',
            url: url.toString(),
            headers,
            data: body,
            timeout: 15_000,
            validateStatus: (status) => status < 500 || RETRYABLE_STATUSES.includes(status),
        };
        return request;
    }
    buildUrl(pathValue, baseUrl) {
        if (pathValue.startsWith('http://') || pathValue.startsWith('https://')) {
            return new URL(pathValue);
        }
        if (!baseUrl) {
            throw new Error('baseUrl is required for relative connector paths');
        }
        return new URL(pathValue, baseUrl);
    }
    async resolveAuth(connector, tenantId, authKey) {
        const authType = connector.manifest.auth.type;
        if (!authKey)
            return undefined;
        const stored = await this.vault.getSecret(tenantId, connector.id, authKey);
        if (!stored)
            return undefined;
        if (authType === 'oauth2') {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.expires_at && parsed.refresh_token && connector.manifest.auth.config.tokenUrl) {
                    const expiresAt = new Date(parsed.expires_at);
                    if (expiresAt <= new Date()) {
                        const refreshed = await this.refreshToken(connector, parsed.refresh_token);
                        if (refreshed) {
                            return { type: 'oauth2', token: refreshed, refreshToken: parsed.refresh_token };
                        }
                    }
                }
                return { type: 'oauth2', token: parsed.access_token || parsed.token || stored };
            }
            catch {
                return { type: 'oauth2', token: stored };
            }
        }
        if (authType === 'api_key') {
            return { type: 'api_key', apiKey: stored };
        }
        if (authType === 'basic') {
            try {
                const parsed = JSON.parse(stored);
                return { type: 'basic', username: parsed.username, password: parsed.password };
            }
            catch {
                const [username, password] = stored.split(':');
                return { type: 'basic', username, password };
            }
        }
        return undefined;
    }
    async refreshToken(connector, refreshToken) {
        const tokenUrl = connector.manifest.auth.config.tokenUrl;
        if (!tokenUrl)
            return undefined;
        try {
            const response = await this.client.post(tokenUrl, new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 8000,
            });
            return response.data.access_token;
        }
        catch {
            return undefined;
        }
    }
    ensureCircuit(connectorId) {
        const state = this.circuitBreaker.get(connectorId);
        if (state?.openUntil && state.openUntil > Date.now()) {
            throw new Error('Circuit breaker open for connector');
        }
    }
    recordFailure(connectorId) {
        const state = this.circuitBreaker.get(connectorId) || { failures: 0 };
        state.failures += 1;
        if (state.failures >= 3) {
            state.openUntil = Date.now() + 30_000;
        }
        this.circuitBreaker.set(connectorId, state);
    }
    recordSuccess(connectorId) {
        this.circuitBreaker.set(connectorId, { failures: 0, openUntil: undefined });
    }
}
