const BULLET_LIMIT = 5;
const SUMMARY_PROMPT = 'Summarize this multi-agent interaction in less than 5 bullet points, describing task, agents involved, and final outcome.';
/**
 * Summarizes a conversation thread into a concise bullet list.
 */
export async function summarizeConversation(thread) {
    if (!thread?.length) {
        return '- Conversation contained no messages.';
    }
    const transcript = buildTranscript(thread);
    const prompt = `${SUMMARY_PROMPT}\n\nConversation Transcript:\n${transcript}\n\nSummary:`;
    try {
        const rawSummary = await generateWithOllama(prompt);
        return formatSummary(rawSummary);
    }
    catch (ollamaError) {
        if (process.env.DEBUG?.includes('governor')) {
            console.warn('Ollama summarization failed, attempting OpenAI fallback:', ollamaError);
        }
        const rawSummary = await generateWithOpenAI(prompt);
        return formatSummary(rawSummary);
    }
}
function buildTranscript(thread) {
    return thread
        .map((message, index) => {
        const speaker = message.agentType ? `${message.origin} (${message.agentType})` : message.origin;
        const content = String(message.content ?? '').replace(/\s+/g, ' ').trim();
        return `${index + 1}. ${speaker}: ${content}`;
    })
        .join('\n');
}
async function generateWithOllama(prompt) {
    const model = process.env.OLLAMA_SUMMARY_MODEL ?? 'mistral';
    const response = await safeFetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!response.ok) {
        throw new Error(`Ollama summary request failed (${response.status}): ${response.statusText}`);
    }
    const payload = await response.json();
    const text = typeof payload?.response === 'string' ? payload.response : '';
    if (!text.trim()) {
        throw new Error('Ollama returned an empty summary response.');
    }
    return text;
}
async function generateWithOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API key missing. Set OPENAI_API_KEY to enable summary fallback.');
    }
    const model = process.env.OPENAI_SUMMARY_MODEL ?? 'gpt-4o-mini';
    const response = await safeFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a concise assistant who writes short bullet summaries.',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 300,
        }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI summary request failed (${response.status}): ${errorBody}`);
    }
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    const text = choice?.message?.content ?? '';
    if (!text.trim()) {
        throw new Error('OpenAI returned an empty summary response.');
    }
    return text;
}
function formatSummary(raw) {
    const cleaned = raw.replace(/^summary:\s*/i, '').trim();
    if (!cleaned) {
        return '- No summary generated.';
    }
    const normalisedLines = cleaned
        .split(/\r?\n+/)
        .map((line) => line.replace(/^\s*[-•]\s*/, '').trim())
        .filter(Boolean);
    if (!normalisedLines.length) {
        normalisedLines.push(cleaned);
    }
    const limited = normalisedLines.slice(0, BULLET_LIMIT);
    return limited.map((line) => `- ${line}`).join('\n');
}
async function safeFetch(url, init) {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch API is unavailable in this runtime.');
    }
    const fetchFn = fetch;
    return fetchFn(url, init);
}
// CommonJS compatibility
const exported = {
    summarizeConversation,
};
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - guarded assignment for CJS consumers.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
}
