import os
import json
import logging
import psycopg2
from psycopg2.extensions import AsIs
from psycopg2.extras import RealDictCursor
import re

logger = logging.getLogger(__name__)


class PgVector:
    """Lightweight adapter to send Python lists to pgvector without stringifying at call sites."""

    def __init__(self, values):
        self.values = values

    def __conform__(self, proto):
        # Format as '[1,2,3]' for pgvector consumption
        return AsIs("'" + "[" + ",".join(f"{float(x)}" for x in self.values) + "]" + "'")


def build_dsn():
    # Prefer DATABASE_URL; fallback to individual PG* vars; default to local docker db.
    url = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL")
    if url and url.startswith("postgres"):
        logger.info(f"[db] Using DATABASE_URL={url}")
        return url

    host = os.environ.get("DB_HOST", "db")
    port = os.environ.get("DB_PORT", "5432")
    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")
    name = os.environ.get("DB_NAME", "postgres")
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{name}"
    logger.info(f"[db] Using manual DSN host={host} db={name} user={user} port={port}")
    return dsn


def get_conn():
    dsn = build_dsn()
    if dsn.startswith("http"):
        raise RuntimeError(f"Invalid DATABASE_URL for Postgres: {dsn}")
    logger.info(f"[db] Connecting to Postgres dsn={dsn}")
    conn = psycopg2.connect(dsn, cursor_factory=RealDictCursor)
    logger.info("[db] Connection established")
    return conn


def fetch_next_job(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT *
              FROM import_jobs
             WHERE status = 'queued'
             ORDER BY created_at ASC
             LIMIT 1
            """
        )
        row = cur.fetchone()
        return row


def update_job(conn, job_id, **fields):
    if not fields:
        return
    keys = list(fields.keys())
    values = [fields[k] for k in keys]
    assignments = ", ".join(f"{k} = %s" for k in keys)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE import_jobs SET {assignments} WHERE id = %s",
            [*values, job_id],
        )
    conn.commit()


def insert_embedding(conn, org_id, account_id, source_type, source_id, normalized_url, content_hash, chunk_index, content, embedding, metadata, visibility_scope="org"):
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO forge_embeddings
                  (org_id, account_id, source_type, source_id, normalized_url, content_hash, chunk_index, content, embedding, metadata, visibility_scope)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s,%s)
                ON CONFLICT (normalized_url, chunk_index) DO NOTHING
                """,
                [
                    org_id,
                    account_id,
                    source_type,
                    source_id,
                    normalized_url,
                    content_hash,
                    chunk_index,
                    content,
                    PgVector(embedding),
                    json.dumps(metadata or {}),
                    visibility_scope,
                ],
            )
        logger.info(f"[db] inserted embedding source_id={source_id} norm={normalized_url} idx={chunk_index} len={len(content)}")
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error(f"🔥 Failed to insert embedding for {source_id}: {exc}")
        raise


def get_embedding_dimension(conn):
    """
    Returns the configured dimension of forge_embeddings.embedding (e.g., 1536 or 3072).
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  format_type(a.atttypid, a.atttypmod) AS embedding_type
                FROM pg_attribute a
                WHERE a.attrelid = 'forge_embeddings'::regclass
                  AND a.attname = 'embedding'
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return None
            type_text = row.get("embedding_type") if isinstance(row, dict) else row[0]
            if not type_text:
                return None
            match = re.search(r"vector\((\d+)\)", type_text)
            if match:
                return int(match.group(1))
    except Exception as exc:
        logger.warning(f"Could not determine embedding dimension: {exc}")
    return None


def insert_usage(conn, org_id, account_id, user_id, source, agent_name, model_name, model_provider, input_tokens, output_tokens, total_tokens, cost_usd, metadata=None):
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO forge_token_usage
                  (org_id, account_id, user_id, source, agent_name, model_name, model_provider, input_tokens, output_tokens, total_tokens, cost_usd, metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                [
                    org_id,
                    account_id,
                    user_id,
                    source,
                    agent_name,
                    model_name,
                    model_provider,
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    cost_usd,
                    json.dumps(metadata or {}),
                ],
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error(f"Failed to insert usage for {source}: {exc}")
        raise
