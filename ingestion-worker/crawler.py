import asyncio
import logging
import re
import os
from typing import List, Dict, Set, Optional
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

try:
    from playwright.async_api import async_playwright, Page, BrowserContext, Browser, Error as PlaywrightError
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

logger = logging.getLogger(__name__)


def chunk_text(text: str, max_chars: int = 1000, overlap: int = 100) -> List[str]:
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        start += max_chars - overlap
        if start >= len(text):
            break
    if start < len(text) and not text[start:].isspace():
        if len(text) - (start - (max_chars - overlap)) > max_chars:
            chunks.append(text[start:])
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    normalized = urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path.rstrip('/') if parsed.path != '/' else parsed.path,
            parsed.params,
            parsed.query,
            ''
        )
    )
    return normalized


def _should_crawl_url(url: str, base_domain: str, allowed_paths: Set[str]) -> bool:
    parsed = urlparse(url)
    if parsed.netloc != base_domain:
        return False
    path_allowed = any(parsed.path.startswith(path) for path in allowed_paths)
    if not path_allowed:
        return False
    skip_patterns = [
        r'/search', r'/login', r'/logout', r'/api/', r'/download/',
        r'\.pdf$', r'\.zip$', r'\.exe$', r'\.dmg$', r'\.jpg$', r'\.png$',
        r'/print/', r'/share/', r'/export/', r'#'
    ]
    if parsed.fragment:
        return False
    for pattern in skip_patterns:
        if re.search(pattern, parsed.path, re.IGNORECASE):
            return False
    return True


def _extract_main_content(soup: BeautifulSoup, url: str) -> Dict[str, str]:
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    elif soup.find('h1'):
        title = soup.find('h1').get_text(strip=True)

    main_selectors = [
        "main", "article", "[role='main']", "#main-content",
        ".main-content", ".content", ".article-body", ".documentation",
        ".doc-content", ".post-content", "#content", ".page-content",
        ".docs-content", ".markdown-body", ".md-content", ".guide-content"
    ]

    content_element = None
    for selector in main_selectors:
        content_element = soup.select_one(selector)
        if content_element:
            break

    if not content_element:
        logger.warning(f"   ... No specific content selector found for {url}. Falling back to body.")
        content_element = soup.body

    if not content_element:
        return {"title": title, "content": ""}

    for element in content_element([
        "script", "style", "nav", "footer", "aside",
        "form", "header", "iframe", "noscript",
        ".navigation", ".sidebar", ".ad", ".advertisement",
        ".breadcrumb", ".toc", ".table-of-contents"
    ]):
        element.decompose()

    text = content_element.get_text(separator=' ', strip=True)
    text = re.sub(r'\s{2,}', ' ', text).strip()

    return {"title": title, "content": text}


async def _block_unwanted_resources(route):
    if route.request.resource_type in ("image", "stylesheet", "font", "media"):
        await route.abort()
    else:
        await route.continue_()


async def crawl_site(
    start_url: str,
    additional_paths: List[str],
    max_pages: int,
    on_progress=None,
    on_page=None,
) -> List[Dict[str, str]]:
    if not PLAYWRIGHT_AVAILABLE:
        logger.critical("Playwright is not installed. Cannot start crawler.")
        return []

    parsed_start_url = urlparse(start_url)
    allowed_domain = parsed_start_url.netloc
    base_path = parsed_start_url.path.rstrip('/')
    if not base_path.startswith('/'):
        base_path = '/' + base_path
    allowed_prefixes_set = {p.rstrip('/') for p in [base_path] + additional_paths if p and p.startswith('/')}
    if parsed_start_url.path and parsed_start_url.path != "/":
        allowed_prefixes_set.add(parsed_start_url.path.rstrip('/'))

    logger.info(f"Crawler restricting paths to: {allowed_prefixes_set}")

    queue: List[str] = [start_url]
    for path in additional_paths:
        full_url = urljoin(start_url, path)
        if urlparse(full_url).netloc == allowed_domain:
            queue.append(full_url)

    visited: Set[str] = set()
    scraped_data: List[Dict[str, str]] = []

    browser_ws = os.environ.get("BROWSER_WS_URL") or "ws://browser:3000"

    async with async_playwright() as p:
        browser: Optional[Browser] = None

        async def get_or_connect_browser() -> Optional[Browser]:
            nonlocal browser
            if browser and browser.is_connected():
                return browser
            logger.info(f"Connecting to browser service at {browser_ws}...")
            try:
                browser = await p.chromium.connect_over_cdp(browser_ws)
                browser.on("disconnected", lambda: logger.warning("Browser service disconnected. Will attempt reconnect on next page."))
                logger.info("Successfully connected to browser service.")
                return browser
            except Exception as e:
                logger.error(f"Failed to connect to browser at {browser_ws}: {e}")
                return None

        browser = await get_or_connect_browser()
        if not browser:
            logger.critical("Initial browser connection failed. Exiting.")
            return []

        while queue and (max_pages == -1 or len(scraped_data) < max_pages):
            url = queue.pop(0)
            normalized_url = normalize_url(url)
            if normalized_url in visited:
                continue
            visited.add(normalized_url)

            if not _should_crawl_url(normalized_url, allowed_domain, allowed_prefixes_set):
                logger.info(f"Skipping (filtered): {normalized_url}")
                continue

            if on_progress:
                try:
                    await on_progress(normalized_url)
                except Exception:
                    pass

            crawl_progress = f"({len(scraped_data) + 1}/{'all' if max_pages == -1 else max_pages})"
            logger.info(f"Crawling {crawl_progress}: {normalized_url}")

            context: Optional[BrowserContext] = None
            try:
                browser = await get_or_connect_browser()
                if not browser:
                    logger.error(f"Browser connection lost. Waiting 15s for restart...")
                    await asyncio.sleep(15)
                    browser = await get_or_connect_browser()
                if not browser:
                    logger.error(f"Reconnect failed. Skipping URL: {normalized_url}")
                    continue

                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                )
                page: Page = await context.new_page()
                await page.route("**/*", _block_unwanted_resources)
                await page.goto(normalized_url, wait_until='domcontentloaded', timeout=60000)
                logger.info(f"   ... DOM content loaded.")
                await asyncio.sleep(5)
                html = await page.content()
                soup = BeautifulSoup(html, 'html.parser')
                content_data = _extract_main_content(soup, normalized_url)

                if content_data["content"] and "JavaScript has been disabled" not in content_data["content"] and len(content_data["content"]) > 100:
                    page_payload = {
                        "url": normalized_url,
                        "title": content_data["title"],
                        "content": content_data["content"]
                    }
                    scraped_data.append(page_payload)
                    logger.info(f"   ... content extracted cc successfully (Title: {content_data['title']}).")
                else:
                    logger.warning(f"   ... no meaningful content found on page.")

                links = await page.eval_on_selector_all('a[href]', '(elements => elements.map(el => el.href))')
                new_links_found = 0
                for link in links:
                    full_link = urljoin(normalized_url, link)
                    normalized_link = normalize_url(full_link)
                    if (normalized_link not in visited and normalized_link not in queue and _should_crawl_url(normalized_link, allowed_domain, allowed_prefixes_set)):
                        queue.append(normalized_link)
                        new_links_found += 1
                logger.info(f"   ... found and queued {new_links_found} new links.")
                if on_page and content_data["content"]:
                    stats = {
                        "visited": len(visited),
                        "queued": len(queue),
                        "scraped": len(scraped_data),
                        "discovered": len(visited) + len(queue),
                        "new_links": new_links_found,
                    }
                    try:
                        await on_page(page_payload, stats)
                    except Exception as e:
                        logger.error(f"on_page callback failed for {normalized_url}: {e}")
                        raise

            except PlaywrightError as e:
                if "Target page, context or browser has been closed" in str(e):
                    logger.error(f"Browser crashed while processing {normalized_url}. It will restart.")
                    browser = None
                else:
                    logger.warning(f"Playwright error processing page {normalized_url}: {e}")
            except Exception as e:
                logger.warning(f"Could not process page {normalized_url}: {e}")
            finally:
                if context:
                    try:
                        await context.close()
                    except Exception as e:
                        logger.warning(f"Context close failed for {normalized_url}: {e}")
            await asyncio.sleep(1)

        logger.info(f"Crawl finished. Scraped {len(scraped_data)} pages.")
        return scraped_data
