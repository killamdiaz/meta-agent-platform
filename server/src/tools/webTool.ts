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
    .filter((entry) => Boolean(entry?.url) && isValidHttpUrl(entry.url))
    .map((entry) => ({
      ...entry,
      url: entry.url.trim(),
      snippet: entry.snippet.trim(),
      title: entry.title.trim(),
    }));
}

const baseEndpoint = process.env.DUCKDUCK_API ?? 'https://api.duckduckgo.com';
const rJinaDuckDuckGoBase = 'https://r.jina.ai/https://duckduckgo.com/';

type RawDuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: RawDuckDuckGoTopic[];
};

function flattenRelatedTopics(topics: RawDuckDuckGoTopic[] | undefined): RawDuckDuckGoTopic[] {
  if (!Array.isArray(topics)) {
    return [];
  }

  const stack = [...topics];
  const flattened: RawDuckDuckGoTopic[] = [];

  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) continue;

    if (Array.isArray(current.Topics) && current.Topics.length > 0) {
      stack.push(...current.Topics);
    }

    flattened.push(current);
  }

  return flattened;
}

function isValidHttpUrl(url: string | undefined | null) {
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
  } catch {
    return false;
  }
}

function scrubMarkdownFormatting(value: string) {
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

function parseRJinaMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const entries: Array<{ title: string; url: string; snippet: string }> = [];
  let currentBlock: string[] = [];

  const flushBlock = () => {
    if (currentBlock.length === 0) {
      return;
    }

    const blockText = currentBlock.join('\n');
    const linkMatches = Array.from(blockText.matchAll(/\[([^\]]+)\]\((https?:[^)]+)\)/g));
    const candidateMatch = linkMatches.find((match) => isValidHttpUrl(match[2]));

    if (!candidateMatch) {
      currentBlock = [];
      return;
    }

    const [, linkText, externalLink] = candidateMatch;
    const rawTitle = scrubMarkdownFormatting(linkText) || externalLink;
    const withoutTitle = blockText.replace(candidateMatch[0], '');
    const rawSnippet = scrubMarkdownFormatting(withoutTitle).trim();

    entries.push({
      title: rawTitle.slice(0, 240) || externalLink,
      url: externalLink,
      snippet: rawSnippet.slice(0, 500),
    });

    currentBlock = [];
  };

  for (const line of lines) {
    const enumerated = /^\d+\.\s+/.test(line);
    if (enumerated) {
      flushBlock();
      currentBlock = [line.replace(/^\d+\.\s+/, '')];
    } else if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }

  flushBlock();

  return entries;
}

function dedupeAndTrimResults(results: Array<{ title: string; url: string; snippet: string }>) {
  const seen = new Set<string>();
  const unique: typeof results = [];

  for (const entry of results) {
    const key = entry.url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      title: entry.title.trim() || entry.url,
      url: entry.url.trim(),
      snippet: entry.snippet.trim(),
    });
  }

  return unique.slice(0, 5);
}

async function fetchRJinaResults(query: string, abortSignal: AbortSignal) {
  const url = `${rJinaDuckDuckGoBase}?q=${encodeURIComponent(query)}&ia=web`;
  console.log('[webTool] outbound request (fallback)', { endpoint: url, query });
  const res = await fetch(url, {
    signal: abortSignal,
    headers: { 'User-Agent': 'meta-agent-platform/1.0 (+https://atlasos.app)' },
  });

  if (!res.ok) {
    return [];
  }

  const text = await res.text();
  return parseRJinaMarkdown(text);
}

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

      const relatedTopics = flattenRelatedTopics(data.RelatedTopics);
      const directResults = Array.isArray(data.Results) ? data.Results : [];

      const combined = [...relatedTopics, ...directResults]
        .map((topic: RawDuckDuckGoTopic | any) => ({
          title: String(topic.Text ?? topic.Result ?? ''),
          url: String(topic.FirstURL ?? topic.FirstUrl ?? ''),
          snippet: String(topic.Text ?? topic.Result ?? ''),
        }))
        .filter((entry) => isValidHttpUrl(entry.url));

      let results = sanitizeResults(dedupeAndTrimResults(combined));

      if (results.length === 0) {
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8000);
        let fallbackErrorMessage: string | null = null;
        try {
          const fallbackResults = await fetchRJinaResults(query, fallbackController.signal);
          if (fallbackResults.length > 0) {
            results = sanitizeResults(dedupeAndTrimResults(fallbackResults));
          }
        } catch (fallbackError) {
          if (fallbackError instanceof Error && fallbackError.name === 'AbortError') {
            return { result: 'Web search fallback timed out after 8 seconds.' };
          }
          fallbackErrorMessage =
            fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error.';
        } finally {
          clearTimeout(fallbackTimeout);
        }

        if (results.length === 0 && fallbackErrorMessage) {
          return { result: `Web search fallback failed: ${fallbackErrorMessage}` };
        }
      }

      if (results.length === 0) {
        return { result: 'No web results found for this query.' };
      }

      return { result: results };
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Web search timed out after 8 seconds.'
          : error instanceof Error
            ? `DuckDuckGo search failed: ${error.message}`
            : 'Unknown error while searching the web.';

      return { result: message };
    } finally {
      clearTimeout(timeout);
    }
  },
};
