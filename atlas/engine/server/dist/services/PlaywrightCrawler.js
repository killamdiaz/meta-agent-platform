import { chromium } from 'playwright-core';
import { URL } from 'node:url';
import * as cheerio from 'cheerio';
function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        const path = parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
        parsed.pathname = path;
        parsed.search = parsed.search;
        return parsed.toString();
    }
    catch {
        return url;
    }
}
function shouldCrawl(url, baseDomain, allowedPaths) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== baseDomain)
            return false;
        const pathAllowed = Array.from(allowedPaths).some((p) => parsed.pathname.startsWith(p));
        if (!pathAllowed)
            return false;
        const skipPatterns = [
            /\/search/i,
            /\/login/i,
            /\/logout/i,
            /\/api\//i,
            /\/download\//i,
            /\.pdf$/i,
            /\.zip$/i,
            /\.exe$/i,
            /\.dmg$/i,
            /\.jpg$/i,
            /\.png$/i,
            /\/print\//i,
            /\/share\//i,
            /\/export\//i,
            /#/,
        ];
        if (skipPatterns.some((re) => re.test(parsed.pathname)))
            return false;
        if (parsed.hash)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
export async function crawlSite(startUrl, additionalPaths, maxPages, onProgress, onStats) {
    const parsedStart = new URL(startUrl);
    const baseDomain = parsedStart.hostname;
    const basePath = parsedStart.pathname.startsWith('/') ? parsedStart.pathname.replace(/\/+$/, '') : `/${parsedStart.pathname}`;
    const allowed = new Set([basePath]);
    additionalPaths
        .filter((p) => p)
        .forEach((p) => {
        const normalized = p.startsWith('/') ? p.replace(/\/+$/, '') : `/${p}`;
        allowed.add(normalized);
    });
    const queue = [startUrl, ...additionalPaths.map((p) => new URL(p, startUrl).toString())];
    const visited = new Set();
    const results = [];
    let browser = null;
    async function ensureBrowser() {
        if (browser && browser.isConnected())
            return browser;
        try {
            browser = await chromium.connectOverCDP('ws://browser:3000');
            return browser;
        }
        catch (error) {
            console.warn('[playwright-crawler] failed to connect to browserless', error);
            browser = null;
            return null;
        }
    }
    browser = await ensureBrowser();
    if (!browser)
        return results;
    while (queue.length && (maxPages === -1 || results.length < maxPages)) {
        const url = queue.shift();
        const normalized = normalizeUrl(url);
        if (visited.has(normalized))
            continue;
        visited.add(normalized);
        if (!shouldCrawl(normalized, baseDomain, allowed))
            continue;
        if (onProgress)
            await onProgress(normalized);
        let context = null;
        try {
            if (!browser || !browser.isConnected()) {
                browser = await ensureBrowser();
                if (!browser)
                    throw new Error('Browser not available');
            }
            context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            });
            const page = await context.newPage();
            await page.route('**/*', async (route) => {
                const type = route.request().resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                    await route.abort();
                }
                else {
                    await route.continue();
                }
            });
            await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(5000);
            const html = await page.content();
            const soup = cheerio.load(html);
            const title = (soup('title').text() || soup('h1').text() || '').trim();
            const mainSelectors = [
                'main',
                'article',
                "[role='main']",
                '#main-content',
                '.main-content',
                '.content',
                '.article-body',
                '.documentation',
                '.doc-content',
                '.post-content',
                '#content',
                '.page-content',
                '.docs-content',
                '.markdown-body',
                '.md-content',
                '.guide-content',
            ];
            let contentElement = null;
            for (const selector of mainSelectors) {
                const found = soup(selector);
                if (found.length) {
                    contentElement = found;
                    break;
                }
            }
            if (!contentElement || contentElement.length === 0) {
                contentElement = soup('body');
            }
            contentElement.find('script, style, nav, footer, aside, form, header, iframe, noscript, .navigation, .sidebar, .ad, .advertisement, .breadcrumb, .toc, .table-of-contents').remove();
            const content = contentElement.text().replace(/\s+/g, ' ').trim();
            if (content && content.length > 100) {
                results.push({ url: normalized, title, content });
            }
            const links = await page.$$eval('a[href]', (els) => els.map((el) => el.href));
            links.forEach((link) => {
                const full = new URL(link, normalized).toString();
                const normLink = normalizeUrl(full);
                if (!visited.has(normLink) && shouldCrawl(normLink, baseDomain, allowed)) {
                    queue.push(normLink);
                }
            });
            if (onStats) {
                try {
                    await onStats({ visited: visited.size, queued: queue.length, discovered: visited.size + queue.length });
                }
                catch (err) {
                    console.warn('[playwright-crawler] stats callback failed', err);
                }
            }
        }
        catch (error) {
            console.warn('[playwright-crawler] error', error);
            browser = null;
        }
        finally {
            await context?.close().catch(() => { });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await browser?.close().catch(() => { });
    return results;
}
