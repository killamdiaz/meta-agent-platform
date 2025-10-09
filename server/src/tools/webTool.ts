import fetch from 'node-fetch';

export interface WebToolResult {
  result:
    | string
    | Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
}

function sanitizeResults(results: WebToolResult['result']): WebToolResult['result'] {
  if (!Array.isArray(results)) {
    return results;
  }

  return results
    .filter((entry) => Boolean(entry?.url) && /^https?:\/\//i.test(entry.url))
    .map((entry) => ({
      ...entry,
      url: entry.url.trim(),
      snippet: entry.snippet.trim(),
      title: entry.title.trim(),
    }));
}

const baseEndpoint = process.env.DUCKDUCK_API ?? 'https://api.duckduckgo.com';

export const webTool = {
  name: 'web',
  description: 'Performs sandboxed internet search via DuckDuckGo API',
  get enabled() {
    return process.env.WEB_ENABLED === 'true';
  },

  async execute(query: string): Promise<WebToolResult> {
    if (!this.enabled) {
      return {
        result:
          'I can’t browse the web in this mode. Enable web access by setting WEB_ENABLED=true in environment variables.',
      };
    }
    const endpoint = `${baseEndpoint}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 8000);

    try {
      console.log('[webTool] outbound request', { endpoint, query });
      const res = await fetch(endpoint, {
        signal: abortController.signal,
        headers: { 'User-Agent': 'meta-agent-platform/1.0 (+https://atlasos.app)' },
      });

      if (!res.ok) {
        return {
          result: `DuckDuckGo search failed with status ${res.status}.`,
        };
      }

      const data: any = await res.json();
      const results = (data.RelatedTopics || [])
        .filter((topic: any) => Boolean(topic?.Text) && Boolean(topic?.FirstURL))
        .slice(0, 5)
        .map((topic: any) => ({
          title: String(topic.Text),
          url: String(topic.FirstURL),
          snippet: String(topic.Text),
        }));

      return { result: sanitizeResults(results) };
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Web search timed out after 8 seconds.'
          : error instanceof Error
            ? error.message
            : 'Unknown error while searching the web.';

      return { result: message };
    } finally {
      clearTimeout(timeout);
    }
  },
};
