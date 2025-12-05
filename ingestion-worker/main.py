import os
import asyncio
import logging
import json
from dotenv import load_dotenv
from openai import AsyncOpenAI
from prometheus_client import Counter, Gauge, start_http_server

import crawler
import db

load_dotenv(dotenv_path="../.env")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

CRAWL_ADDITIONAL_PATHS = [p.strip() for p in os.environ.get("CRAWL_ADDITIONAL_PATHS", "").split(',') if p.strip()]
CRAWL_MAX_PAGES = int(os.environ.get("CRAWL_MAX_PAGES", "50"))
OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
POLL_INTERVAL = int(os.environ.get("INGESTION_POLL_MS", "5000"))

client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

EMBED_INPUT_PRICE_PER_1K = float(os.environ.get("OPENAI_EMBED_INPUT_COST_PER_1K", 0.00002))

requests_total = Counter("requests_total", "Total ingestion jobs processed")
errors_total = Counter("errors_total", "Total ingestion errors")
workflow_runs_total = Counter("workflow_runs_total", "Workflow runs processed by ingestor")
ingestor_docs_parsed_total = Counter("ingestor_docs_parsed_total", "Total documents parsed")
ingestor_queue_depth = Gauge("ingestor_queue_depth", "Queued ingestion jobs")
tokens_consumed_total = Counter("tokens_consumed_total", "Total tokens consumed by ingestor")


async def embed_chunks(chunks):
    resp = await client.embeddings.create(input=chunks, model=OPENAI_EMBEDDING_MODEL)
    usage = getattr(resp, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", None) or getattr(usage, "total_tokens", None) or 0
    if prompt_tokens == 0:
        approx = sum(len(c) for c in chunks) // 4
        prompt_tokens = max(1, approx)
    embeddings = [item.embedding for item in resp.data]
    return embeddings, prompt_tokens


async def process_job(conn, job):
    job_id = job['id']
    org_id = job.get('org_id')
    account_id = job.get('account_id')
    source = job.get('source')
    if not source:
        db.update_job(conn, job_id, status='failed', error_count=((job.get('error_count') or 0) + 1), metadata=json.dumps({"reason": "missing_source"}))
        return

    logger.info(f"Processing job {job_id} source={source}")
    requests_total.inc()
    db.update_job(conn, job_id, status='processing', progress=5, metadata=json.dumps({"current_url": source}))

    processed_chunks = 0
    total_chunks = 0
    pages_seen = 0
    discovered_estimate = 0

    async def handle_page(page, stats):
        nonlocal processed_chunks, total_chunks, pages_seen, discovered_estimate
        pages_seen += 1
        discovered_estimate = max(discovered_estimate, stats.get("discovered", 0) or 0)
        try:
            chunks = crawler.chunk_text(page['content'], max_chars=1000, overlap=100)
            if not chunks:
                logger.info(f"No chunks generated for {page.get('url')}")
                return
            embeddings, prompt_tokens = await embed_chunks(chunks)
            for chunk_text, embedding in zip(chunks, embeddings):
                db.insert_embedding(
                    conn,
                    org_id,
                    account_id,
                    'crawler',
                    page.get('url'),
                    chunk_text,
                    embedding,
                    {"import_job_id": job_id, "title": page.get('title'), "source_url": page.get('url')},
                    'org'
                )
                processed_chunks += 1
            tokens_consumed_total.inc(prompt_tokens)
            db.insert_usage(
                conn,
                org_id,
                account_id,
                None,
                'crawler',
                'IngestionWorker',
                OPENAI_EMBEDDING_MODEL,
                'openai',
                prompt_tokens,
                0,
                prompt_tokens,
                round((prompt_tokens / 1000) * EMBED_INPUT_PRICE_PER_1K, 6),
                {"import_job_id": job_id, "page_url": page.get('url')},
            )
            total_chunks += len(chunks)
            estimated_total = max(discovered_estimate, pages_seen)
            progress = min(95, int(20 + ((pages_seen) / max(estimated_total, 1)) * 70))
            db.update_job(
                conn,
                job_id,
                progress=progress,
                processed_records=processed_chunks,
                total_records=max(total_chunks, estimated_total),
                metadata=json.dumps({"current_url": page.get('url')}),
            )
        except Exception as e:
            logger.error(f"Failed to process page {page.get('url')}: {e}")
            raise

    try:
        await crawler.crawl_site(
            source,
            CRAWL_ADDITIONAL_PATHS,
            CRAWL_MAX_PAGES,
            on_progress=lambda url: asyncio.create_task(_mark_url(conn, job_id, url)),
            on_page=handle_page,
        )
    except Exception as e:
        logger.error(f"Job {job_id} failed during crawl/ingest: {e}")
        db.update_job(
            conn,
            job_id,
            status='failed',
            error_count=((job.get('error_count') or 0) + 1),
            metadata=json.dumps({"error": str(e), "current_url": source}),
        )
        errors_total.inc()
        return

    db.update_job(
        conn,
        job_id,
        status='completed',
        progress=100,
        processed_records=processed_chunks,
        total_records=max(total_chunks, pages_seen),
    )
    ingestor_docs_parsed_total.inc(processed_chunks)
    workflow_runs_total.inc()
    logger.info(f"Job {job_id} completed pages={pages_seen} chunks={processed_chunks}")


async def _mark_url(conn, job_id, url):
    db.update_job(conn, job_id, metadata=json.dumps({"current_url": url}))


async def poll_loop():
    start_http_server(9302)
    while True:
        try:
            with db.get_conn() as conn:
                job = db.fetch_next_job(conn)
                if job:
                    ingestor_queue_depth.set(1)
                    await process_job(conn, job)
                    ingestor_queue_depth.set(0)
                else:
                    ingestor_queue_depth.set(0)
        except Exception as e:
            logger.error(f"Polling error: {e}")
            errors_total.inc()
        await asyncio.sleep(POLL_INTERVAL / 1000)


if __name__ == "__main__":
    if not crawler.PLAYWRIGHT_AVAILABLE:
        logger.critical("Playwright not installed. Install with 'pip install playwright' and 'playwright install chromium'")
    asyncio.run(poll_loop())
