import axios, { AxiosHeaders, type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { config } from '../config.js';

export interface FetchOptions {
  method?: 'GET' | 'POST';
  data?: unknown;
  summarize?: boolean;
  cite?: boolean;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  title?: string;
  author?: string;
  publishedAt?: string;
  contentSnippet?: string;
  summary?: string;
  citations?: string[];
  rawHtml?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

const openai = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').replace(/\s+/g, ' ').trim();
}

export class InternetAccessModule {
  private disallowedHosts = [
    'pinterest.com',
    'quora.com',
    'link.springer.com',
    'medium.com',
    'blogspot.com',
    'tumblr.com',
    'fandom.com',
  ];

  private trustedIndicators = ['news', 'tech', 'reuters', 'wired', 'nytimes', 'bloomberg'];

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: config.internetRequestTimeoutMs,
      headers: {
        'User-Agent':
          'Meta-AgentPlatform/1.0 (+https://atlasos.app) security-contact: security@atlasos.app',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    this.client.interceptors.request.use((request) => {
      if (config.internetProxyUrl) {
        const targetUrl = request.url ?? '';
        request.baseURL = config.internetProxyUrl;
        request.url = '/';
        const headers = ({ ...(request.headers ?? {}) } as Record<string, string>);
        headers['X-Proxy-Target'] = targetUrl;
        if (config.internetProxyToken) {
          headers['Authorization'] = `Bearer ${config.internetProxyToken}`;
        }
        request.headers = AxiosHeaders.from(headers);
      }
      return request;
    });
  }

  private isAllowed(url: string) {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:'].includes(parsed.protocol) === false) {
        return false;
      }
      return !this.disallowedHosts.some((host) => parsed.hostname.endsWith(host));
    } catch (error) {
      console.warn('[internet-access] invalid url rejected', url, error);
      return false;
    }
  }

  private isLikelyTrusted(url: string) {
    return this.trustedIndicators.some((indicator) => url.includes(indicator));
  }

  private async summarizeContent(content: string, url: string) {
    if (!content) {
      return '';
    }

    if (!openai) {
      return content.slice(0, 480);
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an autonomous research agent. Summarize the referenced article in 4 concise bullet points with one-sentence explanations. Include a "Key Quote" line with the most relevant quote.',
        },
        {
          role: 'user',
          content: `URL: ${url}\n\nContent:\n${content.slice(0, 6000)}`,
        },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? content.slice(0, 600);
  }

  private extractMetadata(html: string) {
    const $ = cheerio.load(html);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('meta[name="twitter:creator"]').attr('content') ||
      '';
    const publishedAt =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="pubdate"]').attr('content') ||
      $('time').attr('datetime') ||
      '';

    const paragraphs = $('p')
      .map((_, element) => normalizeText($(element).text()))
      .get()
      .filter((line) => line.length > 0);

    const contentSnippet = normalizeText(paragraphs.slice(0, 8).join(' ')).slice(0, 1200);

    return { title: normalizeText(title), author: normalizeText(author), publishedAt, contentSnippet };
  }

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    if (!this.isAllowed(url)) {
      throw new Error('URL blocked by trust policy or invalid.');
    }

    const method = options.method ?? (options.data ? 'POST' : 'GET');

    const response = await this.client.request({
      url,
      method,
      data: options.data,
      headers: options.headers,
      params: options.queryParams,
    });

    const headers = Object.fromEntries(Object.entries(response.headers));
    const contentType = String(headers['content-type'] ?? '');
    const result: FetchResult = {
      url,
      status: response.status,
      headers,
    };

    if (contentType.includes('text/html')) {
      const html = String(response.data ?? '');
      const meta = this.extractMetadata(html);
      Object.assign(result, meta, { rawHtml: html });

      if (options.summarize || options.cite) {
        const summary = await this.summarizeContent(meta.contentSnippet, url);
        result.summary = summary;
        if (options.cite) {
          result.citations = [`${meta.title || url} (${url})`];
        }
      }
    } else if (typeof response.data === 'string') {
      result.contentSnippet = response.data.slice(0, 1200);
      if (options.summarize) {
        result.summary = await this.summarizeContent(result.contentSnippet, url);
        if (options.cite) {
          result.citations = [`${url}`];
        }
      }
    }

    return result;
  }

  async crawl(url: string, depth = 1) {
    if (depth <= 0) {
      return [] as FetchResult[];
    }

    const root = await this.fetch(url, { summarize: true, cite: true });
    const results: FetchResult[] = [root];

    if (!root.rawHtml || depth === 1) {
      return results;
    }

    try {
      const $ = cheerio.load(root.rawHtml);
      const links = new Set<string>();
      $('a[href]').each((_idx, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        try {
          const resolved = new URL(href, url).toString();
          if (this.isAllowed(resolved)) {
            links.add(resolved);
          }
        } catch {
          // ignore invalid URLs
        }
      });

      let count = 0;
      for (const link of links) {
        if (count >= 5) break;
        try {
          const page = await this.fetch(link, { summarize: true, cite: true });
          if (this.isLikelyTrusted(link)) {
            results.push(page);
            count += 1;
          }
        } catch (error) {
          console.warn('[internet-access] crawl failure for', link, error);
        }
      }
    } catch (error) {
      console.warn('[internet-access] crawl parse failure', error);
    }

    return results;
  }

  async webSearch(query: string): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    if (!config.searchApiKey) {
      console.warn('[internet-access] search disabled - missing SEARCH_API_KEY');
      return [];
    }

    try {
      if (config.searchApiProvider === 'brave') {
        const response = await this.client.get('https://api.search.brave.com/res/v1/web/search', {
          params: { q: query, count: 6 },
          headers: { 'X-Subscription-Token': config.searchApiKey },
        });
        const results = (response.data?.web?.results ?? []) as Array<{
          title: string;
          url: string;
          description: string;
          rank: number;
        }>;
        return results
          .filter((item) => this.isAllowed(item.url))
          .map((item) => ({
            title: item.title,
            url: item.url,
            snippet: item.description,
            score: Math.max(0, 1 - item.rank / 10),
          }));
      }

      // Tavily default
      const response = await this.client.post(
        'https://api.tavily.com/search',
        {
          query,
          include_raw_content: false,
          max_results: 6,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Tavily-Api-Key': config.searchApiKey,
          },
        },
      );

      const results = (response.data?.results ?? []) as Array<{
        title: string;
        url: string;
        content: string;
        score: number;
      }>;

      return results
        .filter((item) => this.isAllowed(item.url))
        .map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.content,
          score: item.score ?? 0.5,
        }));
    } catch (error) {
      console.error('[internet-access] search failure', error);
      return [];
    }
  }
}

export const internetAccessModule = new InternetAccessModule();
