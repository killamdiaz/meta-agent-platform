import { pool } from '../db.js';
import { deterministicEmbedding } from '@atlas/memory-core';
const SHORT_TERM_DEFAULT_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const SHORT_TERM_WITH_TASK_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const PRUNE_INTERVAL_MS = 1000 * 60 * 10; // 10 minutes
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYSTEM_AGENT_NAMESPACE = 'f094c8b8-5f9c-4b91-9f2f-4707177cf041';
export class MemoryService {
    static on(eventHandler) {
        this.listeners.add(eventHandler);
        return () => {
            this.listeners.delete(eventHandler);
        };
    }
    static emit(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch (error) {
                console.error('[memory-service] listener error', error);
            }
        }
    }
    static async addMemory(agentId, content, metadata = {}) {
        await MemoryService.persist(pool, agentId, content, metadata);
    }
    static async listMemories(agentId, limit = 10) {
        const { canonicalId, alias } = await MemoryService.resolveAgentIdentifier(pool, agentId);
        const { rows } = await pool.query(`SELECT m.id,
              COALESCE(a.settings->>'alias', a.name, m.agent_id::text) AS agent_alias,
              m.content,
              m.metadata,
              m.created_at,
              m.memory_type,
              m.expires_at
         FROM agent_memory m
         LEFT JOIN agents a ON a.id = m.agent_id
        WHERE m.agent_id = $1
          AND (m.memory_type != 'short_term' OR m.expires_at IS NULL OR m.expires_at > NOW())
        ORDER BY m.created_at DESC
        LIMIT $2`, [canonicalId, limit]);
        return rows.map(({ agent_alias, ...row }) => ({
            ...row,
            agent_id: alias ?? agent_alias ?? canonicalId
        }));
    }
    static async search(query, limit = 5) {
        const embedding = deterministicEmbedding(query, 768);
        const { rows } = await pool.query(`SELECT m.id,
              COALESCE(a.settings->>'alias', a.name, m.agent_id::text) AS agent_alias,
              m.agent_id,
              m.content,
              m.metadata,
              m.created_at,
              m.memory_type,
              m.expires_at,
              1 - (m.embedding <=> $1::vector) AS similarity
         FROM agent_memory m
         LEFT JOIN agents a ON a.id = m.agent_id
        WHERE m.memory_type != 'short_term' OR m.expires_at IS NULL OR m.expires_at > NOW()
        ORDER BY m.embedding <-> $1::vector
        LIMIT $2`, [MemoryService.toVector(embedding), limit]);
        return rows.map((row) => {
            const { agent_alias, agent_id: canonicalAgentId, ...rest } = row;
            return {
                ...rest,
                agent_id: typeof agent_alias === 'string'
                    ? agent_alias
                    : canonicalAgentId
            };
        });
    }
    static async attachToTransaction(client, agentId, content, metadata) {
        await MemoryService.persist(client, agentId, content, metadata);
    }
    static async persist(executor, agentId, rawContent, metadata) {
        const content = MemoryService.normaliseContent(rawContent);
        if (!content) {
            return {
                stored: false,
                classification: {
                    decision: 'discard',
                    reason: 'Empty or whitespace-only content',
                    confidence: 1
                }
            };
        }
        const classification = MemoryService.classify(content, metadata);
        if (classification.decision === 'discard') {
            return { stored: false, classification };
        }
        const { canonicalId, alias } = await MemoryService.resolveAgentIdentifier(executor, agentId);
        await MemoryService.pruneExpired(executor);
        const memoryType = classification.decision;
        const expiresAt = memoryType === 'short_term'
            ? MemoryService.resolveExpiry(metadata, classification.ttlMs)
            : null;
        const duplicate = await executor.query(`SELECT id
         FROM agent_memory
        WHERE agent_id = $1
          AND content = $2
          AND memory_type = $3
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`, [canonicalId, content, memoryType]);
        if (duplicate.rowCount && duplicate.rowCount > 0) {
            return {
                stored: false,
                classification: {
                    ...classification,
                    reason: `${classification.reason} (duplicate suppressed)`
                }
            };
        }
        const embedding = deterministicEmbedding(content, 768);
        const enrichedMetadata = MemoryService.enrichMetadata(alias ?? agentId, metadata, classification, expiresAt);
        const { rows } = await executor.query(`INSERT INTO agent_memory(agent_id, content, embedding, metadata, memory_type, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id,
                 agent_id,
                 content,
                 metadata,
                 created_at,
                 memory_type,
                 expires_at`, [canonicalId, content, MemoryService.toVector(embedding), enrichedMetadata, memoryType, expiresAt]);
        const memory = rows[0];
        if (memory) {
            memory.agent_id = alias ?? agentId;
            MemoryService.emit({ type: 'created', memory });
            return { stored: true, record: memory, classification };
        }
        return { stored: false, classification };
    }
    static enrichMetadata(agentId, metadata, classification, expiresAt) {
        const createdBy = metadata?.createdBy ?? agentId;
        const retention = {
            decision: classification.decision,
            reason: classification.reason,
            confidence: classification.confidence,
            storedAt: new Date().toISOString(),
            expiresAt: expiresAt ? expiresAt.toISOString() : null
        };
        return {
            ...metadata,
            createdBy,
            memoryType: classification.decision,
            retention
        };
    }
    static async pruneExpired(executor) {
        const now = Date.now();
        if (now - MemoryService.lastPruneAt < PRUNE_INTERVAL_MS) {
            return;
        }
        MemoryService.lastPruneAt = now;
        try {
            await executor.query(`DELETE
           FROM agent_memory
          WHERE memory_type = 'short_term'
            AND expires_at IS NOT NULL
            AND expires_at <= NOW()`);
        }
        catch (error) {
            console.warn('[memory-service] failed to prune expired short-term memory', error);
        }
    }
    static resolveExpiry(metadata, ttlOverride) {
        const ttlSecondsRaw = MemoryService.getMetadataValue(metadata, 'ttlSeconds');
        if (typeof ttlSecondsRaw === 'number' && Number.isFinite(ttlSecondsRaw)) {
            const ttlSeconds = Math.max(15, Number(ttlSecondsRaw));
            return new Date(Date.now() + ttlSeconds * 1000);
        }
        if (ttlOverride && Number.isFinite(ttlOverride)) {
            return new Date(Date.now() + ttlOverride);
        }
        if (MemoryService.hasMetadataValue(metadata, 'taskId')) {
            return new Date(Date.now() + SHORT_TERM_WITH_TASK_TTL_MS);
        }
        return new Date(Date.now() + SHORT_TERM_DEFAULT_TTL_MS);
    }
    static normaliseContent(content) {
        return content.trim().replace(/\s+/g, ' ');
    }
    static isUuid(value) {
        return UUID_PATTERN.test(value);
    }
    static normaliseAlias(alias) {
        return alias.replace(/\s+/g, ' ').trim().toLowerCase();
    }
    static toDisplayName(alias) {
        const cleaned = alias.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned) {
            return 'System Agent';
        }
        return cleaned
            .split(' ')
            .filter(Boolean)
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(' ');
    }
    static async resolveAgentIdentifier(executor, rawAgentId) {
        const trimmed = (rawAgentId ?? '').trim();
        if (!trimmed) {
            throw new Error('Agent identifier is required to persist memory.');
        }
        if (MemoryService.isUuid(trimmed)) {
            return { canonicalId: trimmed };
        }
        const normalised = MemoryService.normaliseAlias(trimmed);
        try {
            const existing = await executor.query(`SELECT id
           FROM agents
          WHERE lower(settings->>'alias') = $1
             OR lower(settings->>'alias_normalized') = $1
             OR lower(name) = $1
         LIMIT 1`, [normalised]);
            if (existing.rows.length > 0) {
                return { canonicalId: existing.rows[0].id, alias: trimmed };
            }
        }
        catch (error) {
            console.warn('[memory-service] failed to resolve agent alias; continuing with dynamic registration', {
                agentId: trimmed,
                error
            });
        }
        const displayName = MemoryService.toDisplayName(trimmed);
        const { rows } = await executor.query(`WITH target AS (
         SELECT uuid_generate_v5($1::uuid, $2::text) AS id
       ),
       upsert AS (
         INSERT INTO agents (id, name, role, settings)
         SELECT target.id,
                $3,
                $4,
                jsonb_build_object(
                  'alias',
                  $5::text,
                  'alias_normalized',
                  $2::text
                )
           FROM target
         ON CONFLICT (id) DO UPDATE
           SET updated_at = NOW(),
               settings = COALESCE(agents.settings, '{}'::jsonb) || jsonb_build_object(
                 'alias',
                 $5::text,
                 'alias_normalized',
                 $2::text
               )
         RETURNING id
       )
       SELECT id FROM upsert`, [SYSTEM_AGENT_NAMESPACE, normalised, displayName, displayName, trimmed]);
        return { canonicalId: rows[0]?.id ?? trimmed, alias: trimmed };
    }
    static classify(content, metadata) {
        const lower = content.toLowerCase();
        const normalizedMetadata = metadata ?? {};
        const explicit = MemoryService.extractExplicitDecision(normalizedMetadata);
        if (explicit) {
            return explicit;
        }
        let longScore = 0;
        let shortScore = 0;
        if (MemoryService.getBooleanFlag(normalizedMetadata, 'persist') === true) {
            longScore += 2.5;
        }
        if (MemoryService.getBooleanFlag(normalizedMetadata, 'ephemeral') === true) {
            shortScore += 2.5;
        }
        const importance = MemoryService.getString(normalizedMetadata, 'importance');
        if (importance) {
            const loweredImportance = importance.toLowerCase();
            if (loweredImportance === 'high' || loweredImportance === 'critical' || loweredImportance === 'persistent') {
                longScore += 2;
            }
            if (loweredImportance === 'low' || loweredImportance === 'temp' || loweredImportance === 'temporary') {
                shortScore += 1.5;
            }
        }
        if (MemoryService.hasMetadataValue(normalizedMetadata, 'taskId')) {
            shortScore += 1.2;
        }
        const category = MemoryService.getString(normalizedMetadata, 'category');
        if (category === 'preference' || category === 'instruction') {
            longScore += 2;
        }
        const longTermKeywords = [
            'always',
            'never',
            'remember',
            'prefer',
            'preference',
            'goal',
            'objective',
            'mission',
            'deadline',
            'due ',
            'due on',
            'due by',
            'policy',
            'strategy',
            'strategic',
            'long-term',
            'long term',
            'permanent',
            'persist',
            'should',
            'must',
            'guideline',
            'decided',
            'decision'
        ];
        const shortTermKeywords = [
            'sent to',
            'received',
            'in progress',
            'working on',
            'ongoing',
            'status update',
            'current status',
            'temporary',
            'draft',
            'reply to',
            'responded to',
            'api response',
            'fetched',
            'processing',
            'queued',
            'analysis',
            'raw output',
            'scratchpad'
        ];
        for (const keyword of longTermKeywords) {
            if (lower.includes(keyword)) {
                longScore += 1;
            }
        }
        for (const keyword of shortTermKeywords) {
            if (lower.includes(keyword)) {
                shortScore += 1;
            }
        }
        if (lower.includes('summary') || lower.includes('result') || lower.includes('conclusion')) {
            longScore += 0.8;
        }
        if (lower.length < 40 && shortScore === 0 && longScore === 0) {
            return {
                decision: 'discard',
                reason: 'Insufficient signal for retention',
                confidence: 0.4
            };
        }
        if (/^no (response|action) (generated|required)/.test(lower)) {
            return {
                decision: 'discard',
                reason: 'Negligible informational value',
                confidence: 0.8
            };
        }
        if (longScore - shortScore >= 1) {
            return {
                decision: 'long_term',
                reason: 'Classified as persistent knowledge',
                confidence: Math.min(1, 0.55 + (longScore - shortScore) / 5)
            };
        }
        if (shortScore - longScore >= 1 || lower.length < 160) {
            return {
                decision: 'short_term',
                reason: 'Optimised for current task context',
                confidence: Math.min(1, 0.5 + (shortScore - longScore) / 4),
                ttlMs: MemoryService.hasMetadataValue(normalizedMetadata, 'taskId')
                    ? SHORT_TERM_WITH_TASK_TTL_MS
                    : SHORT_TERM_DEFAULT_TTL_MS
            };
        }
        return {
            decision: 'long_term',
            reason: 'Defaulted to long-term to preserve context',
            confidence: 0.5
        };
    }
    static extractExplicitDecision(metadata) {
        const explicitType = MemoryService.getString(metadata, 'memoryType');
        const directive = MemoryService.getString(metadata, 'retention');
        const hint = explicitType ?? directive;
        if (hint) {
            const normalized = hint.toLowerCase();
            if (normalized === 'stm' || normalized === 'short' || normalized === 'short_term') {
                return {
                    decision: 'short_term',
                    reason: 'Explicit directive',
                    confidence: 1
                };
            }
            if (normalized === 'ltm' || normalized === 'long' || normalized === 'long_term') {
                return {
                    decision: 'long_term',
                    reason: 'Explicit directive',
                    confidence: 1
                };
            }
            if (normalized === 'discard' || normalized === 'skip') {
                return {
                    decision: 'discard',
                    reason: 'Explicit directive to discard',
                    confidence: 1
                };
            }
        }
        const keepFlag = MemoryService.getBooleanFlag(metadata, 'keep');
        const discardFlag = MemoryService.getBooleanFlag(metadata, 'discard');
        if (keepFlag === false || discardFlag === true) {
            return {
                decision: 'discard',
                reason: 'Explicit discard flag',
                confidence: 1
            };
        }
        return null;
    }
    static getMetadataValue(metadata, key) {
        if (!metadata)
            return undefined;
        const value = metadata[key];
        return value;
    }
    static hasMetadataValue(metadata, key) {
        if (!metadata)
            return false;
        return metadata[key] !== undefined && metadata[key] !== null;
    }
    static getString(metadata, key) {
        const value = MemoryService.getMetadataValue(metadata, key);
        return typeof value === 'string' ? value : undefined;
    }
    static getBooleanFlag(metadata, key) {
        const value = MemoryService.getMetadataValue(metadata, key);
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lowered = value.toLowerCase();
            if (lowered === 'true')
                return true;
            if (lowered === 'false')
                return false;
        }
        return undefined;
    }
    static toVector(values) {
        return `[${values.join(',')}]`;
    }
}
MemoryService.listeners = new Set();
MemoryService.lastPruneAt = 0;
