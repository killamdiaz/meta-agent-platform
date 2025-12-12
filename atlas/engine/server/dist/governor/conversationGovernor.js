/**
 * Conversation governor for detecting loops and redundant exchanges.
 * Provides slide-window embedding tracking and cycle limit enforcement.
 */
const embeddingCache = new Map();
const resolvedEmbeddings = new Map();
export const SIMILARITY_THRESHOLD = 0.92;
const WINDOW_SIZE = 3;
/**
 * Generates a normalized embedding vector for the given text, caching results in-memory.
 */
export async function embed(text) {
    const cleaned = text.trim();
    if (!cleaned) {
        return [0];
    }
    if (resolvedEmbeddings.has(cleaned)) {
        return resolvedEmbeddings.get(cleaned);
    }
    if (!embeddingCache.has(cleaned)) {
        embeddingCache.set(cleaned, generateEmbedding(cleaned).catch((error) => {
            embeddingCache.delete(cleaned);
            throw error;
        }));
    }
    const vector = await embeddingCache.get(cleaned);
    resolvedEmbeddings.set(cleaned, vector);
    return vector;
}
async function generateEmbedding(text) {
    try {
        return await requestOllamaEmbedding(text);
    }
    catch (ollamaError) {
        if (process.env.DEBUG?.includes('governor')) {
            console.warn('Ollama embedding failed, attempting OpenAI fallback:', ollamaError);
        }
        return requestOpenAIEmbedding(text);
    }
}
async function requestOllamaEmbedding(text) {
    const model = process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
    const response = await safeFetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
    });
    if (!response.ok) {
        throw new Error(`Ollama embedding request failed (${response.status}): ${response.statusText}`);
    }
    const payload = await response.json();
    const vector = Array.isArray(payload?.embedding) ? payload.embedding : undefined;
    if (!vector?.length) {
        throw new Error('Ollama embedding payload malformed.');
    }
    return normalize(vector);
}
async function requestOpenAIEmbedding(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API key missing. Set OPENAI_API_KEY to enable embedding fallback.');
    }
    const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
    const response = await safeFetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: text, model }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI embedding request failed (${response.status}): ${errorBody}`);
    }
    const payload = await response.json();
    const vector = payload?.data?.[0]?.embedding;
    if (!vector?.length) {
        throw new Error('OpenAI embedding payload malformed.');
    }
    return normalize(vector);
}
async function safeFetch(url, init) {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch API is unavailable in this runtime.');
    }
    const fetchFn = fetch;
    return fetchFn(url, init);
}
function normalize(vector) {
    const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0));
    if (!norm) {
        return vector.map(() => 0);
    }
    return vector.map((val) => val / norm);
}
function cosineSimilarity(a, b) {
    if (!a.length || !b.length || a.length !== b.length) {
        return 0;
    }
    let dot = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
    }
    return Math.min(1, Math.max(-1, dot));
}
function meanVector(vectors) {
    if (!vectors.length) {
        return undefined;
    }
    const dimension = vectors[0].length;
    const accumulator = new Array(dimension).fill(0);
    for (const vector of vectors) {
        if (vector.length !== dimension) {
            return undefined;
        }
        for (let i = 0; i < dimension; i += 1) {
            accumulator[i] += vector[i];
        }
    }
    for (let i = 0; i < dimension; i += 1) {
        accumulator[i] /= vectors.length;
    }
    return normalize(accumulator);
}
function pushEmbeddingWindow(state, embedding) {
    if (!Array.isArray(state.lastEmbeddings)) {
        state.lastEmbeddings = [];
    }
    state.lastEmbeddings.push(embedding);
    if (state.lastEmbeddings.length > WINDOW_SIZE) {
        state.lastEmbeddings.splice(0, state.lastEmbeddings.length - WINDOW_SIZE);
    }
}
/**
 * Evaluates the latest message, updating the conversation state and determining loop behaviour.
 */
export async function conversationGovernor(msg, state) {
    const embedding = await embed(msg.content ?? '');
    const history = Array.isArray(state.lastEmbeddings) ? state.lastEmbeddings : [];
    const baseline = meanVector(history);
    const similarity = baseline ? cosineSimilarity(baseline, embedding) : 0;
    pushEmbeddingWindow(state, embedding);
    const maxCycles = state.maxCycles ?? 8;
    state.cycleCount = (state.cycleCount ?? 0) + 1;
    if (state.cycleCount > maxCycles) {
        state.complete = true;
        return {
            type: 'completion',
            content: '✅ Task cycle limit reached. Summarizing thread...',
        };
    }
    if (similarity > SIMILARITY_THRESHOLD) {
        return {
            suppressed: true,
            reason: 'similar',
            similarity,
        };
    }
    return { similarity };
}
// CommonJS compatibility
const exported = {
    embed,
    conversationGovernor,
    SIMILARITY_THRESHOLD,
};
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - guarded assignment for CJS consumers.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
}
