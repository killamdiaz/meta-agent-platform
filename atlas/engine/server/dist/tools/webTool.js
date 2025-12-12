import fetch from 'node-fetch';
function sanitizeResults(results) {
    if (!Array.isArray(results)) {
        return results;
    }
    return results
        .filter((entry) => Boolean(entry?.url) && isValidHttpUrl(entry.url))
        .map((entry) => ({
        ...entry,
        url: entry.url.trim(),
        snippet: entry.snippet.trim(),
        title: entry.title.trim(),
    }));
}
const braveSearchEndpoint = process.env.BRAVE_SEARCH_ENDPOINT ?? 'https://api.search.brave.com/res/v1/web/search';
function isValidHttpUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        if (/duckduckgo\.com$/i.test(parsed.hostname)) {
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
function scrubMarkdownFormatting(value) {
    return value
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function dedupeAndTrimResults(results) {
    const seen = new Set();
    const unique = [];
    for (const entry of results) {
        const key = entry.url.trim();
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push({
            title: entry.title.trim() || entry.url,
            url: entry.url.trim(),
            snippet: entry.snippet.trim(),
        });
    }
    return unique.slice(0, 5);
}
function extractBraveResults(data) {
    const webResults = Array.isArray(data.web?.results) ? data.web?.results : [];
    const mixedResults = Array.isArray(data.mixed?.results) && data.mixed?.results?.length
        ? data.mixed?.results
            .map((result) => {
            if (result.entity) {
                return result.entity;
            }
            return {
                title: result.title,
                url: result.url,
                description: result.description,
            };
        })
            .filter(Boolean)
        : [];
    const combined = [...webResults, ...mixedResults];
    return combined
        .map((result) => {
        const title = scrubMarkdownFormatting(result.title ?? '');
        const url = result.url ?? '';
        const snippet = scrubMarkdownFormatting(result.extra_snippet ?? result.snippet ?? result.description ?? '');
        return { title, url, snippet };
    })
        .filter((entry) => isValidHttpUrl(entry.url));
}
export const webTool = {
    name: 'web',
    description: 'Performs sandboxed internet search via Brave Search API',
    get enabled() {
        return process.env.WEB_ENABLED === 'true';
    },
    async execute(query) {
        if (!this.enabled) {
            return {
                result: 'I can’t browse the web in this mode. Enable web access by setting WEB_ENABLED=true in environment variables.',
            };
        }
        const braveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY;
        if (!braveSearchApiKey) {
            return {
                result: 'Brave Search API key is not configured. Set BRAVE_SEARCH_API_KEY in environment variables.',
            };
        }
        const endpoint = `${braveSearchEndpoint}?q=${encodeURIComponent(query)}&count=6&search_lang=en`;
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), 8000);
        try {
            console.log('[webTool] outbound request', { endpoint, query });
            const res = await fetch(endpoint, {
                signal: abortController.signal,
                headers: {
                    'User-Agent': 'meta-agent-platform/1.0 (+https://atlasos.app)',
                    'X-Subscription-Token': braveSearchApiKey,
                    Accept: 'application/json',
                },
            });
            if (!res.ok) {
                return {
                    result: `Brave Search API request failed with status ${res.status}.`,
                };
            }
            const data = (await res.json());
            const mappedResults = extractBraveResults(data);
            const results = sanitizeResults(dedupeAndTrimResults(mappedResults));
            if (results.length === 0) {
                return { result: 'No web results found for this query.' };
            }
            return { result: results };
        }
        catch (error) {
            const message = error instanceof Error && error.name === 'AbortError'
                ? 'Web search timed out after 8 seconds.'
                : error instanceof Error
                    ? `Brave Search request failed: ${error.message}`
                    : 'Unknown error while searching the web.';
            return { result: message };
        }
        finally {
            clearTimeout(timeout);
        }
    },
};
