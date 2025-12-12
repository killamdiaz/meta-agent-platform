const OLLAMA_ENDPOINT = process.env.OLLAMA_URL?.replace(/\/+$/, '') ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'mistral:7b';
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? 20000);
const MAX_RETRIES = 2;
const BACKOFF_SEQUENCE_MS = [1000, 3000];
const queue = [];
let isProcessing = false;
export async function runLocalManaged(prompt) {
    return new Promise((resolve, reject) => {
        const entry = { prompt, resolve, reject };
        queue.push(entry);
        console.log(`[local-llm] queued: ${truncatePrompt(prompt)}`);
        void processQueue();
    });
}
async function processQueue() {
    if (isProcessing || queue.length === 0) {
        return;
    }
    const { prompt, resolve, reject } = queue.shift();
    isProcessing = true;
    try {
        const result = await generateLocalLLM(prompt);
        resolve(result);
    }
    catch (error) {
        reject(error);
    }
    finally {
        isProcessing = false;
        void processQueue();
    }
}
export async function generateLocalLLM(prompt) {
    const payload = {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
    };
    let attempt = 0;
    const start = Date.now();
    const promptLength = prompt?.length ?? 0;
    console.log(`[local-llm] start: ${OLLAMA_MODEL} (len=${promptLength})`);
    while (true) {
        try {
            const response = await fetchWithTimeout(`${OLLAMA_ENDPOINT}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, DEFAULT_TIMEOUT_MS);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            const data = await response.json();
            const duration = Date.now() - start;
            console.log(`[local-llm] done in ${(duration / 1000).toFixed(2)}s`);
            return data?.response ?? '';
        }
        catch (error) {
            const message = normalizeError(error);
            const duration = Date.now() - start;
            const retriable = isRetriable(message);
            if (retriable && attempt < MAX_RETRIES) {
                const backoff = BACKOFF_SEQUENCE_MS[attempt] ?? BACKOFF_SEQUENCE_MS[BACKOFF_SEQUENCE_MS.length - 1];
                console.warn(`[local-llm] error: ${message} (retrying in ${backoff}ms...)`);
                attempt += 1;
                await delay(backoff);
                continue;
            }
            console.error(`[local-llm] failed after ${(duration / 1000).toFixed(2)}s`, message);
            throw new Error(`local-llm error: ${message}`);
        }
    }
}
async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('timeout');
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
function normalizeError(error) {
    if (!error) {
        return 'unknown error';
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function isRetriable(message) {
    const lower = message.toLowerCase();
    return (lower.includes('abort') ||
        lower.includes('timeout') ||
        lower.includes('socket hang up') ||
        lower.includes('connection') ||
        lower.includes('fetch failed'));
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function truncatePrompt(prompt, max = 40) {
    if (!prompt)
        return '';
    return prompt.length > max ? `${prompt.slice(0, max - 3)}...` : prompt;
}
