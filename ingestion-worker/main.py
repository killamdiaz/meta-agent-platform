import os
import asyncio
import logging
import json
from dotenv import load_dotenv
from openai import AsyncOpenAI
from prometheus_client import Counter, Gauge, start_http_server

import crawler
import db
import hashlib

load_dotenv(dotenv_path="../.env")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSION = 3072
MODEL_INPUT_PRICE_PER_1K = {
    "text-embedding-3-large": 0.00013,
}

CRAWL_ADDITIONAL_PATHS = [p.strip() for p in os.environ.get("CRAWL_ADDITIONAL_PATHS", "").split(',') if p.strip()]
CRAWL_MAX_PAGES = int(os.environ.get("CRAWL_MAX_PAGES", "50"))
POLL_INTERVAL = int(os.environ.get("INGESTION_POLL_MS", "5000"))

client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

EMBED_INPUT_PRICE_OVERRIDE = os.environ.get("OPENAI_EMBED_INPUT_COST_PER_1K")

requests_total = Counter("requests_total", "Total ingestion jobs processed")
errors_total = Counter("errors_total", "Total ingestion errors")
workflow_runs_total = Counter("workflow_runs_total", "Workflow runs processed by ingestor")
ingestor_docs_parsed_total = Counter("ingestor_docs_parsed_total", "Total documents parsed")
ingestor_queue_depth = Gauge("ingestor_queue_depth", "Queued ingestion jobs")
tokens_consumed_total = Counter("tokens_consumed_total", "Total tokens consumed by ingestor")


def resolve_embedding_model(conn, db_dim=None):
    """
    Force the large embedding model; fail fast if DB dimension is incompatible.
    """
    if db_dim is None:
        db_dim = db.get_embedding_dimension(conn)
    if db_dim and db_dim != EMBEDDING_DIMENSION:
        raise RuntimeError(
            f"forge_embeddings.embedding dimension={db_dim}; expected {EMBEDDING_DIMENSION} for {EMBEDDING_MODEL}. "
            "Run the 20250106_forge_embeddings_cleanup.sql migration to upgrade the column."
        )
    return EMBEDDING_MODEL


def resolve_embed_price_per_1k(model: str) -> float:
    if EMBED_INPUT_PRICE_OVERRIDE:
        try:
            return float(EMBED_INPUT_PRICE_OVERRIDE)
        except ValueError:
            logger.warning(f"Invalid OPENAI_EMBED_INPUT_COST_PER_1K={EMBED_INPUT_PRICE_OVERRIDE}; falling back to model pricing.")
    return MODEL_INPUT_PRICE_PER_1K.get(model, MODEL_INPUT_PRICE_PER_1K[EMBEDDING_MODEL])


async def embed_chunks(chunks, model: str):
    resp = await client.embeddings.create(input=chunks, model=model)
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
    db_embedding_dim = db.get_embedding_dimension(conn)
    embedding_model = resolve_embedding_model(conn, db_embedding_dim)
    embed_price_per_1k = resolve_embed_price_per_1k(embedding_model)
    logger.info(f"Using embedding model={embedding_model} db_dim={db_embedding_dim} price_per_1k={embed_price_per_1k}")

    async def handle_page(page, stats):
        nonlocal processed_chunks, total_chunks, pages_seen, discovered_estimate
        pages_seen += 1
        discovered_estimate = max(discovered_estimate, stats.get("discovered", 0) or 0)
        try:
            chunks = crawler.chunk_text(page['content'], max_chars=1000, overlap=100)
            if not chunks:
                logger.info(f"No chunks generated for {page.get('url')}")
                return
            embeddings, prompt_tokens = await embed_chunks(chunks, embedding_model)
            normalized_url = crawler.normalize_url(page.get('url'))
            for idx, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
                if db_embedding_dim and len(embedding) != db_embedding_dim:
                    raise ValueError(f"Embedding dimension mismatch: expected {db_embedding_dim}, got {len(embedding)} for {page.get('url')}")
                content_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
                db.insert_embedding(
                    conn,
                    org_id,
                    account_id,
                    'crawler',
                    page.get('url'),
                    normalized_url,
                    content_hash,
                    idx,
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
                embedding_model,
                'openai',
                prompt_tokens,
                0,
                prompt_tokens,
                round((prompt_tokens / 1000) * embed_price_per_1k, 6),
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
