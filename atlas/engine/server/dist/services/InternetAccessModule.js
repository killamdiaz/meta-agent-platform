import axios, { AxiosHeaders, } from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { routeMessage } from '../llm/router.js';
function normalizeText(text) {
    return text.replace(/\s+/g, ' ').replace(/\s+/g, ' ').trim();
}
export class InternetAccessModule {
    constructor() {
        this.disallowedHosts = [
            'pinterest.com',
            'quora.com',
            'link.springer.com',
            'blogspot.com',
            'tumblr.com',
            'fandom.com',
        ];
        this.trustedIndicators = ['news', 'tech', 'reuters', 'wired', 'nytimes', 'bloomberg'];
        this.client = axios.create({
            timeout: config.internetRequestTimeoutMs,
            headers: {
                'User-Agent': 'Meta-AgentPlatform/1.0 (+https://atlasos.app) security-contact: security@atlasos.app',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        this.client.interceptors.request.use((request) => {
            if (config.internetProxyUrl) {
                const targetUrl = request.url ?? '';
                request.baseURL = config.internetProxyUrl;
                request.url = '/';
                const headers = { ...(request.headers ?? {}) };
                headers['X-Proxy-Target'] = targetUrl;
                if (config.internetProxyToken) {
                    headers['Authorization'] = `Bearer ${config.internetProxyToken}`;
                }
                request.headers = AxiosHeaders.from(headers);
            }
            return request;
        });
    }
    isAllowed(url) {
        try {
            const parsed = new URL(url);
            if (['http:', 'https:'].includes(parsed.protocol) === false) {
                return false;
            }
            return !this.disallowedHosts.some((host) => parsed.hostname.endsWith(host));
        }
        catch (error) {
            console.warn('[internet-access] invalid url rejected', url, error);
            return false;
        }
    }
    isLikelyTrusted(url) {
        return this.trustedIndicators.some((indicator) => url.includes(indicator));
    }
    async summarizeContent(content, url) {
        if (!content) {
            return '';
        }
        const summary = await routeMessage({
            prompt: `URL: ${url}\n\nContent:\n${content.slice(0, 6000)}`,
            context: 'You are an autonomous research agent. Summarize the referenced article in 4 concise bullet points with one-sentence explanations. Include a "Key Quote" line with the most relevant quote.',
            intent: 'internet_summary',
        });
        return summary || content.slice(0, 600);
    }
    extractMetadata(html) {
        const $ = cheerio.load(html);
        const title = $('meta[property="og:title"]').attr('content') || $('title').text();
        const author = $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content') ||
            $('meta[name="twitter:creator"]').attr('content') ||
            '';
        const publishedAt = $('meta[property="article:published_time"]').attr('content') ||
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
    toFallbackUrl(url) {
        try {
            const parsed = new URL(url);
            const normalized = `${parsed.hostname}${parsed.pathname}${parsed.search ?? ''}`.replace(/^\/+/, '');
            const protocol = parsed.protocol === 'https:' ? 'https' : 'http';
            return `https://r.jina.ai/${protocol}://${normalized}`;
        }
        catch {
            return null;
        }
    }
    async buildResult(originalUrl, response, options, usedFallback) {
        const headers = Object.fromEntries(Object.entries(response.headers));
        const contentType = String(headers['content-type'] ?? '');
        const result = {
            url: originalUrl,
            status: response.status,
            headers,
            usedFallback,
        };
        const ensureText = (input) => {
            if (typeof input === 'string') {
                return input;
            }
            if (Buffer.isBuffer(input)) {
                return input.toString('utf8');
            }
            if (input && typeof input === 'object') {
                try {
                    return JSON.stringify(input).slice(0, 4000);
                }
                catch {
                    return '';
                }
            }
            return '';
        };
        if (!usedFallback && contentType.includes('text/html')) {
            const html = ensureText(response.data ?? '');
            const meta = this.extractMetadata(html);
            Object.assign(result, meta, { rawHtml: html });
            if (options.summarize || options.cite) {
                const summary = await this.summarizeContent(meta.contentSnippet, originalUrl);
                result.summary = summary;
                if (options.cite) {
                    result.citations = [`${meta.title || originalUrl} (${originalUrl})`];
                }
            }
            return result;
        }
        const bodyText = normalizeText(ensureText(response.data ?? ''));
        if (bodyText) {
            result.contentSnippet = bodyText.slice(0, 1200);
            if (!result.title) {
                result.title = bodyText.split('\n').find(Boolean)?.slice(0, 140);
            }
        }
        if (options.summarize && result.contentSnippet) {
            result.summary = await this.summarizeContent(result.contentSnippet, originalUrl);
            if (options.cite) {
                result.citations = [`${result.title || originalUrl} (${originalUrl})${usedFallback ? ' [mirror]' : ''}`];
            }
        }
        else if (options.cite) {
            result.citations = [`${originalUrl}${usedFallback ? ' [mirror]' : ''}`];
        }
        return result;
    }
    async fetch(url, options = {}) {
        if (!this.isAllowed(url)) {
            throw new Error('URL blocked by trust policy or invalid.');
        }
        const method = options.method ?? (options.data ? 'POST' : 'GET');
        try {
            const response = await this.client.request({
                url,
                method,
                data: options.data,
                headers: options.headers,
                params: options.queryParams,
                validateStatus: (status) => status >= 200 && status < 400,
            });
            return await this.buildResult(url, response, options, false);
        }
        catch (error) {
            if (method !== 'GET') {
                throw error;
            }
            const fallbackUrl = this.toFallbackUrl(url);
            if (!fallbackUrl) {
                throw error;
            }
            try {
                const response = await this.client.request({
                    url: fallbackUrl,
                    method: 'GET',
                    headers: {
                        Accept: 'text/plain',
                        ...(options.headers ?? {}),
                    },
                    params: options.queryParams,
                    validateStatus: (status) => status >= 200 && status < 400,
                });
                return await this.buildResult(url, response, options, true);
            }
            catch (fallbackError) {
                throw fallbackError;
            }
        }
    }
    async crawl(url, depth = 1) {
        if (depth <= 0) {
            return [];
        }
        const root = await this.fetch(url, { summarize: true, cite: true });
        const results = [root];
        if (!root.rawHtml || depth === 1) {
            return results;
        }
        try {
            const $ = cheerio.load(root.rawHtml);
            const links = new Set();
            $('a[href]').each((_idx, element) => {
                const href = $(element).attr('href');
                if (!href)
                    return;
                try {
                    const resolved = new URL(href, url).toString();
                    if (this.isAllowed(resolved)) {
                        links.add(resolved);
                    }
                }
                catch {
                    // ignore invalid URLs
                }
            });
            let count = 0;
            for (const link of links) {
                if (count >= 5)
                    break;
                try {
                    const page = await this.fetch(link, { summarize: true, cite: true });
                    if (this.isLikelyTrusted(link)) {
                        results.push(page);
                        count += 1;
                    }
                }
                catch (error) {
                    console.warn('[internet-access] crawl failure for', link, error);
                }
            }
        }
        catch (error) {
            console.warn('[internet-access] crawl parse failure', error);
        }
        return results;
    }
    async webSearch(query) {
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
                const results = (response.data?.web?.results ?? []);
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
            const response = await this.client.post('https://api.tavily.com/search', {
                query,
                include_raw_content: false,
                max_results: 6,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tavily-Api-Key': config.searchApiKey,
                },
            });
            const results = (response.data?.results ?? []);
            return results
                .filter((item) => this.isAllowed(item.url))
                .map((item) => ({
                title: item.title,
                url: item.url,
                snippet: item.content,
                score: item.score ?? 0.5,
            }));
        }
        catch (error) {
            console.error('[internet-access] search failure', error);
            return [];
        }
    }
}
export const internetAccessModule = new InternetAccessModule();
