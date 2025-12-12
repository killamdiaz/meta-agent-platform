import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../../config.js';
import { ensureNoInlineSecrets, validateConnectorPackage } from './validator.js';
import { isVersionGreater } from './types.js';
export class ConnectorService {
    constructor(store, options = {}) {
        this.store = store;
        this.registryPath = options.registryPath || config.connectorRegistryPath;
    }
    async saveDraft(tenantId, payload) {
        const connectorId = payload.id || randomUUID();
        const validated = validateConnectorPackage(payload);
        const storagePath = await this.persistToDisk(connectorId, validated);
        const record = await this.store.saveDraft({
            id: connectorId,
            tenantId,
            manifest: validated.manifest,
            actions: validated.actions,
            triggers: validated.triggers,
            transforms: validated.transforms,
            verified: false,
            downloadCount: 0,
            storagePath,
        });
        return record;
    }
    async installConnector(tenantId, payload) {
        const connectorId = payload.id || randomUUID();
        const validated = validateConnectorPackage(payload);
        const latest = await this.store.getLatestForTenantName(tenantId, validated.manifest.name);
        if (latest && !isVersionGreater(validated.manifest.version, latest.manifest.version)) {
            throw new Error(`Version must be greater than ${latest.manifest.version}`);
        }
        const storagePath = await this.persistToDisk(connectorId, validated);
        return this.store.installConnector({
            id: connectorId,
            tenantId,
            manifest: validated.manifest,
            actions: validated.actions,
            triggers: validated.triggers,
            transforms: validated.transforms,
            verified: false,
            downloadCount: 0,
            storagePath,
        });
    }
    async publishConnector(tenantId, payload, verified = false) {
        ensureNoInlineSecrets(payload);
        const connectorId = payload.id || randomUUID();
        const validated = validateConnectorPackage(payload);
        const latest = await this.store.getLatestForTenantName(tenantId, validated.manifest.name);
        if (latest && !isVersionGreater(validated.manifest.version, latest.manifest.version)) {
            throw new Error(`Version must be greater than ${latest.manifest.version}`);
        }
        const storagePath = await this.persistToDisk(connectorId, validated);
        const record = await this.store.publishConnector({
            id: connectorId,
            tenantId,
            manifest: validated.manifest,
            actions: validated.actions,
            triggers: validated.triggers,
            transforms: validated.transforms,
            verified,
            downloadCount: 0,
            storagePath,
        });
        return record;
    }
    async installPublishedConnector(connectorId, tenantId) {
        const existing = await this.store.getById(connectorId);
        if (!existing) {
            throw new Error('Connector not found');
        }
        const payload = {
            manifest: existing.manifest,
            actions: existing.actions,
            triggers: existing.triggers,
            transforms: existing.transforms,
        };
        return this.installConnector(tenantId, payload);
    }
    async listInstalled(tenantId) {
        return this.store.listInstalled(tenantId);
    }
    async listDrafts(tenantId) {
        return this.store.listDrafts(tenantId);
    }
    async listMarketplace() {
        return this.store.listMarketplace();
    }
    async getConnector(id) {
        return this.store.getById(id);
    }
    async persistToDisk(id, payload) {
        const baseDir = path.join(this.registryPath, id, payload.manifest.version);
        await fs.mkdir(path.join(baseDir, 'actions'), { recursive: true });
        await fs.mkdir(path.join(baseDir, 'triggers'), { recursive: true });
        await fs.mkdir(path.join(baseDir, 'transforms'), { recursive: true });
        await fs.mkdir(path.join(baseDir, 'auth'), { recursive: true });
        await fs.writeFile(path.join(baseDir, 'connector.json'), JSON.stringify(payload.manifest, null, 2), 'utf8');
        for (const [name, action] of Object.entries(payload.actions)) {
            await fs.writeFile(path.join(baseDir, 'actions', `${name}.json`), JSON.stringify(action, null, 2), 'utf8');
        }
        for (const [name, trigger] of Object.entries(payload.triggers)) {
            await fs.writeFile(path.join(baseDir, 'triggers', `${name}.json`), JSON.stringify(trigger, null, 2), 'utf8');
        }
        for (const [name, src] of Object.entries(payload.transforms)) {
            await fs.writeFile(path.join(baseDir, 'transforms', `${name}.js`), src, 'utf8');
        }
        await fs.writeFile(path.join(baseDir, 'auth', 'config.json'), JSON.stringify(payload.manifest.auth, null, 2), 'utf8');
        return baseDir;
    }
}
