import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
function now() {
    return new Date();
}
function clone(pkg) {
    return {
        ...pkg,
        manifest: JSON.parse(JSON.stringify(pkg.manifest)),
        actions: JSON.parse(JSON.stringify(pkg.actions)),
        triggers: JSON.parse(JSON.stringify(pkg.triggers)),
        transforms: { ...pkg.transforms },
    };
}
export class InMemoryConnectorStore {
    constructor() {
        this.connectors = new Map();
    }
    async persist(status, pkg, verified = false) {
        const id = pkg.id || randomUUID();
        const record = {
            ...pkg,
            id,
            status,
            verified,
            downloadCount: pkg.downloadCount ?? 0,
            createdAt: now(),
            updatedAt: now(),
        };
        this.connectors.set(id, record);
        return clone(record);
    }
    async saveDraft(pkg) {
        return this.persist('draft', pkg, pkg.verified);
    }
    async installConnector(pkg) {
        return this.persist('installed', pkg, pkg.verified);
    }
    async publishConnector(pkg, verified) {
        return this.persist('published', pkg, verified ?? pkg.verified);
    }
    async listInstalled(tenantId) {
        return Array.from(this.connectors.values())
            .filter((c) => c.tenantId === tenantId && c.status === 'installed')
            .map(clone);
    }
    async listDrafts(tenantId) {
        return Array.from(this.connectors.values())
            .filter((c) => c.tenantId === tenantId && c.status === 'draft')
            .map(clone);
    }
    async listMarketplace() {
        return Array.from(this.connectors.values())
            .filter((c) => c.status === 'published')
            .map(clone);
    }
    async getById(id) {
        const record = this.connectors.get(id);
        return record ? clone(record) : null;
    }
    async getLatestForTenantName(tenantId, name) {
        const candidates = Array.from(this.connectors.values()).filter((c) => c.tenantId === tenantId && c.manifest.name === name);
        const sorted = candidates.sort((a, b) => (a.manifest.version > b.manifest.version ? -1 : 1));
        return sorted[0] ? clone(sorted[0]) : null;
    }
    async incrementDownload(id) {
        const record = this.connectors.get(id);
        if (record) {
            record.downloadCount += 1;
            record.updatedAt = now();
        }
    }
}
function mapRow(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        manifest: row.manifest,
        actions: row.actions,
        triggers: row.triggers,
        transforms: row.transforms,
        status: row.status,
        verified: row.verified,
        downloadCount: row.download_count,
        storagePath: row.storage_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
async function persistRow(status, pkg, verified) {
    const id = pkg.id || randomUUID();
    const params = [
        id,
        pkg.tenantId,
        pkg.manifest.name,
        pkg.manifest.version,
        pkg.manifest.description,
        pkg.manifest.icon || '',
        pkg.manifest.publisher,
        pkg.manifest.category,
        status,
        verified,
        pkg.downloadCount ?? 0,
        pkg.storagePath,
        pkg.manifest,
        pkg.actions,
        pkg.triggers,
        pkg.transforms,
    ];
    const result = await pool.query(`
    INSERT INTO atlas_connectors
      (id, tenant_id, name, version, description, icon, publisher, category, status, verified, download_count, storage_path, manifest, actions, triggers, transforms)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (tenant_id, name, version)
    DO UPDATE SET description = EXCLUDED.description,
                  icon = EXCLUDED.icon,
                  publisher = EXCLUDED.publisher,
                  category = EXCLUDED.category,
                  status = EXCLUDED.status,
                  verified = EXCLUDED.verified,
                  download_count = EXCLUDED.download_count,
                  storage_path = EXCLUDED.storage_path,
                  manifest = EXCLUDED.manifest,
                  actions = EXCLUDED.actions,
                  triggers = EXCLUDED.triggers,
                  transforms = EXCLUDED.transforms,
                  updated_at = NOW()
    RETURNING *;
  `, params);
    return mapRow(result.rows[0]);
}
async function recordVersion(connectorId, pkg, status) {
    await pool.query(`
    INSERT INTO atlas_connector_versions
      (connector_id, version, status, manifest, actions, triggers, transforms, storage_path)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (connector_id, version) DO NOTHING;
  `, [connectorId, pkg.manifest.version, status, pkg.manifest, pkg.actions, pkg.triggers, pkg.transforms, pkg.storagePath]);
}
export class PostgresConnectorStore {
    async saveDraft(pkg) {
        const saved = await persistRow('draft', pkg, pkg.verified);
        await recordVersion(saved.id, saved, 'draft');
        return saved;
    }
    async installConnector(pkg) {
        const saved = await persistRow('installed', pkg, pkg.verified);
        await recordVersion(saved.id, saved, 'installed');
        return saved;
    }
    async publishConnector(pkg, verified) {
        const saved = await persistRow('published', pkg, verified ?? pkg.verified);
        await recordVersion(saved.id, saved, 'published');
        return saved;
    }
    async listInstalled(tenantId) {
        const { rows } = await pool.query('SELECT * FROM atlas_connectors WHERE tenant_id = $1 AND status = $2', [
            tenantId,
            'installed',
        ]);
        return rows.map(mapRow);
    }
    async listDrafts(tenantId) {
        const { rows } = await pool.query('SELECT * FROM atlas_connectors WHERE tenant_id = $1 AND status = $2', [
            tenantId,
            'draft',
        ]);
        return rows.map(mapRow);
    }
    async listMarketplace() {
        const { rows } = await pool.query('SELECT * FROM atlas_connectors WHERE status = $1', ['published']);
        return rows.map(mapRow);
    }
    async getById(id) {
        const { rows } = await pool.query('SELECT * FROM atlas_connectors WHERE id = $1', [id]);
        if (!rows[0])
            return null;
        return mapRow(rows[0]);
    }
    async getLatestForTenantName(tenantId, name) {
        const { rows } = await pool.query(`
      SELECT * FROM atlas_connectors
      WHERE tenant_id = $1 AND name = $2
      ORDER BY string_to_array(version, '.')::int[] DESC
      LIMIT 1
    `, [tenantId, name]);
        return rows[0] ? mapRow(rows[0]) : null;
    }
    async incrementDownload(id) {
        await pool.query('UPDATE atlas_connectors SET download_count = download_count + 1, updated_at = NOW() WHERE id = $1', [
            id,
        ]);
    }
}
