import { CLIENT_BINDINGS } from './clients/map.js';
import { logAgentEvent } from './agent-logger.js';
import { coreOrchestrator } from '../multiAgent/index.js';
const LOG_PREFIX = '[client-binder]';
const normaliseHaystack = (...inputs) => {
    return inputs
        .flatMap((value) => (typeof value === 'string' ? value : []))
        .map((value) => value.toLowerCase())
        .join(' ');
};
const matchesBinding = (haystack, key, binding) => {
    if (haystack.includes(key)) {
        return true;
    }
    return Boolean(binding.aliases?.some((alias) => haystack.includes(alias)));
};
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const collectContextSources = (agentInstance, context) => {
    const sources = [];
    const seen = new Set();
    const register = (value) => {
        if (!isRecord(value) || seen.has(value)) {
            return;
        }
        seen.add(value);
        sources.push(value);
    };
    const registerNested = (value) => {
        if (isRecord(value)) {
            register(value);
        }
    };
    register(context);
    if (isRecord(context)) {
        for (const key of ['config', 'credentials', 'settings', 'secrets']) {
            registerNested(context[key]);
        }
    }
    const instanceCandidate = agentInstance;
    if (isRecord(instanceCandidate)) {
        for (const key of ['config', 'credentials', 'settings', 'secrets']) {
            registerNested(instanceCandidate[key]);
        }
    }
    return sources;
};
const normaliseCredentialValue = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return null;
};
const lookupValue = (sources, path) => {
    const segments = path
        .split('.')
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length === 0) {
        return null;
    }
    for (const source of sources) {
        let current = source;
        let matched = true;
        for (const segment of segments) {
            if (!isRecord(current)) {
                matched = false;
                break;
            }
            const lower = segment.toLowerCase();
            const key = Object.keys(current).find((candidate) => candidate.toLowerCase() === lower);
            if (!key) {
                matched = false;
                break;
            }
            current = current[key];
        }
        if (matched) {
            const normalised = normaliseCredentialValue(current);
            if (normalised !== null) {
                return normalised;
            }
        }
    }
    return null;
};
const collectCredentials = (binding, contextSources) => {
    const credentials = {};
    const missing = [];
    for (const variable of binding.env) {
        const variants = variable
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean);
        if (variants.length === 0) {
            continue;
        }
        const canonical = variants[0];
        const match = variants.find((name) => {
            const envValue = process.env[name];
            if (envValue !== undefined && envValue !== null && envValue !== '') {
                credentials[canonical] = envValue;
                return true;
            }
            return false;
        });
        if (!match) {
            const configFallbacks = binding.configKeys?.[canonical] ?? [];
            let resolved = null;
            for (const key of configFallbacks) {
                resolved = lookupValue(contextSources, key);
                if (resolved) {
                    credentials[canonical] = resolved;
                    break;
                }
            }
            if (!resolved) {
                let requirement = variants.length === 1
                    ? canonical
                    : `${canonical} (or ${variants.slice(1).join(', ')})`;
                if (configFallbacks.length > 0) {
                    requirement += `; config keys: ${configFallbacks.join(', ')}`;
                }
                missing.push(requirement);
            }
        }
    }
    return { credentials, missing };
};
const importModule = async (moduleName, label, type) => {
    try {
        return await import(moduleName);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error.code;
        if (code === 'MODULE_NOT_FOUND') {
            console.warn(`${LOG_PREFIX} SDK "${moduleName}" not installed; attempting fallback for ${label} (type=${type}).`);
            return undefined;
        }
        console.warn(`${LOG_PREFIX} Error importing "${moduleName}" for ${label} (type=${type}): ${message}`);
        return undefined;
    }
};
export async function bindClient(agentInstance, type, context) {
    const bindable = agentInstance;
    bindable.client = null;
    const haystack = normaliseHaystack(type, agentInstance.constructor?.name, agentInstance.name, agentInstance.role);
    const matchedEntry = Object.entries(CLIENT_BINDINGS).find(([keyword, binding]) => matchesBinding(haystack, keyword, binding));
    if (!matchedEntry) {
        console.log(`${LOG_PREFIX} No binding found for type=${type}`);
        logAgentEvent(bindable.id, `No client binding matched for type ${type}`, {
            metadata: { stage: 'binding', status: 'skipped' },
        });
        return agentInstance;
    }
    const [, binding] = matchedEntry;
    const contextSources = collectContextSources(agentInstance, context);
    const { credentials, missing } = collectCredentials(binding, contextSources);
    if (missing.length > 0) {
        console.warn(`${LOG_PREFIX} Missing credentials (${missing.join(', ')}) for ${binding.label}; skipping bind for type=${type}`);
        logAgentEvent(bindable.id, `Skipped client bind for ${binding.label}: missing credentials`, {
            metadata: { stage: 'binding', status: 'missing_credentials', missing },
        });
        return agentInstance;
    }
    try {
        const namespace = binding.module ? await importModule(binding.module, binding.label, type) : undefined;
        const client = await binding.builder(namespace, credentials);
        if (!client) {
            console.warn(`${LOG_PREFIX} Builder returned no client for ${binding.label} (type=${type})`);
            logAgentEvent(bindable.id, `Client builder returned empty value for ${binding.label}`, {
                metadata: { stage: 'binding', status: 'builder_failed' },
            });
            return agentInstance;
        }
        bindable.client = client;
        console.log(`${LOG_PREFIX} Bound ${binding.label} client for type=${type}`);
        coreOrchestrator.updateBindings(bindable.id, [binding.label.toLowerCase()]);
        logAgentEvent(bindable.id, `Bound ${binding.label} client`, {
            metadata: { stage: 'binding', status: 'bound', provider: binding.label },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${LOG_PREFIX} Failed to bind ${binding.label} client for type=${type}: ${message}`);
        logAgentEvent(bindable.id, `Failed to bind ${binding.label} client: ${message}`, {
            metadata: { stage: 'binding', status: 'error', provider: binding.label },
        });
    }
    return agentInstance;
}
// Future: Add Auto-Learning Bindings
// The MetaController can dynamically define CLIENT_BINDINGS for new tools
// and persist them to Supabase for reuse.
