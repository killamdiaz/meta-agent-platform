const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'mistral:7b';
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);
function buildPrompt(prompt, context) {
    if (!context) {
        return prompt;
    }
    return `${context.trim()}\n\n${prompt.trim()}`;
}
async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    }
    finally {
        clearTimeout(timer);
    }
}
export async function generateLocal(options) {
    const { prompt, context = '' } = options;
    const payload = {
        model: DEFAULT_OLLAMA_MODEL,
        prompt: buildPrompt(prompt, context),
        stream: Boolean(options.stream),
    };
    try {
        const response = await fetchWithTimeout(`${DEFAULT_OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
        }
        if (!options.stream) {
            const data = await response.json();
            return data?.response ?? '';
        }
        return streamLocalLLMFromResponse(response);
    }
    catch (error) {
        throw new Error(`local-llm error: ${error.message}`);
    }
}
export async function streamLocalLLM(options) {
    const { prompt, context = '', onToken } = options;
    const payload = {
        model: DEFAULT_OLLAMA_MODEL,
        prompt: buildPrompt(prompt, context),
        stream: true,
    };
    try {
        const response = await fetchWithTimeout(`${DEFAULT_OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`Ollama streaming failed (${response.status}): ${errorText}`);
        }
        return streamLocalLLMFromResponse(response, onToken);
    }
    catch (error) {
        throw new Error(`local-llm stream error: ${error.message}`);
    }
}
async function streamLocalLLMFromResponse(response, onToken) {
    if (!response.body) {
        return '';
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let final = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
            let parsed;
            try {
                parsed = JSON.parse(line);
            }
            catch {
                continue;
            }
            const token = parsed?.response ?? '';
            if (token) {
                final += token;
                if (typeof onToken === 'function') {
                    onToken(token);
                }
            }
        }
    }
    return final;
}
