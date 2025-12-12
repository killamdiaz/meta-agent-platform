import { routeMessage } from '../llm/router.js';
const FALLBACK_CAPABILITIES = ['reason over context', 'coordinate with other agents', 'report findings'];
function buildFallbackSchema(agentName) {
    return {
        name: agentName.replace(/\s+/g, ' ').trim() || 'Dynamic Agent',
        description: `Automatically generated agent to fulfil "${agentName}" requests.`,
        inputs: {
            context: {
                type: 'string',
                description: 'Primary task request or conversation payload.',
            },
        },
        outputs: {
            result: {
                type: 'string',
                description: 'Primary response produced after reasoning about the input.',
            },
        },
        capabilities: [...FALLBACK_CAPABILITIES],
    };
}
function coerceToRecord(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return {};
}
function coerceToStringArray(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
            if (typeof entry === 'string')
                return entry.trim();
            if (entry && typeof entry === 'object' && 'name' in entry) {
                return String(entry.name ?? '').trim();
            }
            return String(entry ?? '').trim();
        })
            .filter((entry) => entry.length > 0);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(/[,\n]/)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }
    return [];
}
function extractJsonPayload(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return JSON.parse(trimmed);
    }
    const match = trimmed.match(/\{[\s\S]+\}/);
    if (match) {
        return JSON.parse(match[0]);
    }
    throw new Error('No JSON object found in LLM response.');
}
function sanitiseSchema(agentName, payload) {
    const fallback = buildFallbackSchema(agentName);
    if (!payload || typeof payload !== 'object') {
        return fallback;
    }
    const draft = payload;
    const nameCandidate = typeof draft.name === 'string' ? draft.name.trim() : fallback.name;
    const descriptionCandidate = typeof draft.description === 'string' && draft.description.trim().length > 0
        ? draft.description.trim()
        : fallback.description;
    const inputs = coerceToRecord(draft.inputs);
    const outputs = coerceToRecord(draft.outputs);
    const capabilities = coerceToStringArray(draft.capabilities);
    return {
        name: nameCandidate || fallback.name,
        description: descriptionCandidate || fallback.description,
        inputs: Object.keys(inputs).length > 0 ? inputs : fallback.inputs,
        outputs: Object.keys(outputs).length > 0 ? outputs : fallback.outputs,
        capabilities: capabilities.length > 0 ? capabilities : fallback.capabilities,
    };
}
export async function generateDynamicAgentSchema(agentName) {
    const prompt = [
        `You are defining a new AI agent called "${agentName}".`,
        'Describe its purpose, inputs, outputs, and capabilities as a JSON object.',
        'Follow this format exactly:',
        '{',
        '  "name": "",',
        '  "description": "",',
        '  "inputs": {...},',
        '  "outputs": {...},',
        '  "capabilities": [...]',
        '}',
    ].join('\n');
    try {
        const content = await routeMessage({
            prompt,
            context: 'Respond with valid JSON only. Include fields name, description, inputs, outputs, capabilities.',
            intent: 'agent_schema_definition',
        });
        if (!content) {
            console.warn(`[meta-controller] Empty schema response for "${agentName}", using fallback.`);
            return buildFallbackSchema(agentName);
        }
        const parsed = extractJsonPayload(content);
        return sanitiseSchema(agentName, parsed);
    }
    catch (error) {
        console.error(`[meta-controller] Failed to generate schema for "${agentName}"`, error);
        return buildFallbackSchema(agentName);
    }
}
