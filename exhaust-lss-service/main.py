import asyncio
import hmac
import os
import uuid
import random
import string
import datetime
from hashlib import sha256
from typing import Any, List, Optional

import asyncpg
import orjson
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from logBuffer import LogBuffer
from errorDetector import ErrorDetector
from ephemeralEmbedder import EphemeralEmbedder


def get_env(name: str, default: Optional[str] = None) -> str:
  value = os.getenv(name, default)
  if value is None:
    raise RuntimeError(f"Missing env {name}")
  return value


DATABASE_URL = get_env("DATABASE_URL")
REDIS_URL = get_env("REDIS_URL", "redis://redis:6379/0")
PUBLIC_URL = get_env("EXHAUST_PUBLIC_URL", "http://localhost:4100")
ALLOWED_ORIGINS = (
  os.getenv("EXHAUST_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost")
  .split(",")
  if os.getenv("EXHAUST_ALLOWED_ORIGINS")
  else ["http://localhost:3000", "http://localhost"]
)
OPENAI_API_KEY = get_env("OPENAI_API_KEY")

app = FastAPI(title="Exhaust LSS Service")
app.add_middleware(
  CORSMiddleware,
  allow_origins=ALLOWED_ORIGINS,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

buffer = LogBuffer()
client = AsyncOpenAI(api_key=OPENAI_API_KEY)
error_detector = ErrorDetector(client)
embedder = EphemeralEmbedder(client)


class CreateExhaustRequest(BaseModel):
  org_id: uuid.UUID
  name: str
  type: str = Field(pattern="^(custom|zscaler_lss)$")


class SearchRequest(BaseModel):
  query: str
  limit: int = 10


async def get_db():
  conn = await asyncpg.connect(DATABASE_URL)
  try:
    yield conn
  finally:
    await conn.close()


async def get_redis():
  client = Redis.from_url(REDIS_URL)
  try:
    yield client
  finally:
    await client.close()


def random_token(prefix: str = "exh_live_", length: int = 12) -> str:
  alphabet = string.ascii_lowercase + string.digits
  return prefix + "".join(random.choice(alphabet) for _ in range(length))


def normalize_lss_event(event: dict) -> str:
  parts: List[str] = []
  zia = event.get("zia") or {}
  zpa = event.get("zpa") or {}
  if zia:
    user = zia.get("user")
    action = zia.get("action")
    src_ip = zia.get("src_ip")
    url = zia.get("url")
    categories = zia.get("categorization") or []
    if user:
      parts.append(f"User: {user}")
    if action:
      parts.append(f"Action: {action}")
    if src_ip:
      parts.append(f"Source IP: {src_ip}")
    if url:
      parts.append(f"URL: {url}")
    if categories:
      parts.append(f"Category: {', '.join(categories)}")
  if zpa:
    if zpa.get("user_name"):
      parts.append(f"User: {zpa['user_name']}")
    if zpa.get("action"):
      parts.append(f"Action: {zpa['action']}")
    if zpa.get("app_name"):
      parts.append(f"App: {zpa['app_name']}")
    if zpa.get("segment_group"):
      parts.append(f"Segment: {zpa['segment_group']}")
    if zpa.get("access_type"):
      parts.append(f"Access: {zpa['access_type']}")
    if zpa.get("connector_name"):
      parts.append(f"Connector: {zpa['connector_name']}")
    if zpa.get("device_posture"):
      parts.append(f"Device Posture: {zpa['device_posture']}")
  if not parts:
    parts.append(orjson.dumps(event).decode())
  return "\n".join(parts)


async def fetch_exhaust(conn: asyncpg.Connection, exhaust_id: uuid.UUID) -> Optional[asyncpg.Record]:
  return await conn.fetchrow("SELECT * FROM exhausts WHERE id = $1", exhaust_id)

async def fetch_logs(conn: asyncpg.Connection, exhaust_id: uuid.UUID, limit: int = 100):
  return await conn.fetch(
    """
    SELECT id, raw_json, normalized_text, created_at
      FROM zscaler_lss_logs
     WHERE exhaust_id = $1
     ORDER BY id DESC
     LIMIT $2
    """,
    exhaust_id,
    limit,
  )


@app.post("/exhausts/create")
async def create_exhaust(payload: CreateExhaustRequest, db=Depends(get_db), request: Request = None):
  exhaust_id = uuid.uuid4()
  secret = random_token(64)
  ingest_url = (
    f"{PUBLIC_URL}/integrations/zscaler/lss/{exhaust_id}/ingest"
    if payload.type == "zscaler_lss"
    else f"{PUBLIC_URL}/exhausts/{exhaust_id}/ingest"
  )
  await db.execute(
    """
    INSERT INTO exhausts (id, org_id, type, name, secret_token, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    """,
    exhaust_id,
    payload.org_id,
    payload.type,
    payload.name,
    secret,
  )
  resp = (
    {
      "exhaust_id": str(exhaust_id),
      "lss_ingest_url": ingest_url,
      "lss_secret": secret,
      "instructions": "Paste URL and secret into Zscaler LSS Log Streaming Service.",
    }
    if payload.type == "zscaler_lss"
    else {
      "exhaust_id": str(exhaust_id),
      "ingest_url": ingest_url,
      "secret_token": secret,
      "instructions": "Send JSON logs via POST.",
    }
  )
  origin = request.headers.get("origin") if request else None
  return add_cors(JSONResponse(resp), origin)


@app.get("/exhausts")
async def list_exhausts(org_id: Optional[uuid.UUID] = None, db=Depends(get_db), request: Request = None):
  rows = await db.fetch(
    "SELECT id, org_id, type, name, secret_token, created_at FROM exhausts WHERE ($1::uuid IS NULL OR org_id = $1)",
    org_id,
  )
  items = []
  for r in rows:
    ingest_url = (
      f"{PUBLIC_URL}/integrations/zscaler/lss/{r['id']}/ingest"
      if r["type"] == "zscaler_lss"
      else f"{PUBLIC_URL}/exhausts/{r['id']}/ingest"
    )
    items.append(
      {
        "id": str(r["id"]),
        "org_id": str(r["org_id"]),
        "type": r["type"],
        "name": r["name"],
        "ingest_url": ingest_url,
        "secret_token": r["secret_token"],
        "created_at": r["created_at"].isoformat(),
      }
    )
  origin = request.headers.get("origin") if request else None
  return add_cors(JSONResponse({"items": items}), origin)


@app.get("/exhausts/{exhaust_id}/logs")
async def list_logs(exhaust_id: uuid.UUID, limit: int = 100, db=Depends(get_db), request: Request = None):
  exhaust = await fetch_exhaust(db, exhaust_id)
  if not exhaust:
    raise HTTPException(status_code=404, detail="Exhaust not found")
  items = buffer.get_logs(str(exhaust_id), min(max(limit, 1), 500))
  origin = request.headers.get("origin") if request else None
  return add_cors(JSONResponse({"items": items}), origin)


@app.post("/integrations/zscaler/lss/{exhaust_id}/ingest")
async def ingest_lss(
  exhaust_id: uuid.UUID,
  request: Request,
  db=Depends(get_db),
  redis=Depends(get_redis),
  x_atlas_secret: str = Header(None),
):
  exhaust = await fetch_exhaust(db, exhaust_id)
  if not exhaust or exhaust["type"] != "zscaler_lss":
    raise HTTPException(status_code=404, detail="Exhaust not found")
  secret = exhaust["secret_token"]
  if not x_atlas_secret or x_atlas_secret != secret:
    raise HTTPException(status_code=401, detail="Invalid secret")

  raw_body = await request.body()
  # Accept NDJSON or JSON array/object
  events: List[Any] = []
  try:
    text = raw_body.decode()
    for line in text.splitlines():
      if not line.strip():
        continue
      events.append(orjson.loads(line))
  except Exception:
    try:
      parsed = orjson.loads(raw_body)
      if isinstance(parsed, list):
        events.extend(parsed)
      else:
        events.append(parsed)
    except Exception as exc:
      raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

  created = 0
  for event in events:
    normalized = normalize_lss_event(event)
    entry = {
      "id": str(uuid.uuid4()),
      "timestamp": event.get("timestamp") or datetime.datetime.utcnow().isoformat() + "Z",
      "level": "INFO",
      "message": normalized,
      "raw": event,
    }
    buffer.add_log(str(exhaust_id), entry)
    await error_detector.handle_log(str(exhaust_id), normalized)
    created += 1

  origin = request.headers.get("origin")
  return add_cors(JSONResponse({"status": "ok", "ingested": created}), origin)


@app.post("/exhausts/{exhaust_id}/ingest")
async def ingest_custom(
  exhaust_id: uuid.UUID,
  request: Request,
  db=Depends(get_db),
  redis=Depends(get_redis),
  x_atlas_secret: str = Header(None),
):
  exhaust = await fetch_exhaust(db, exhaust_id)
  if not exhaust or exhaust["type"] != "custom":
    raise HTTPException(status_code=404, detail="Exhaust not found")
  secret = exhaust["secret_token"]
  if not x_atlas_secret or x_atlas_secret != secret:
    raise HTTPException(status_code=401, detail="Invalid secret")

  raw_body = await request.body()
  events: List[Any] = []
  try:
    text = raw_body.decode()
    for line in text.splitlines():
      if not line.strip():
        continue
      events.append(orjson.loads(line))
  except Exception:
    try:
      parsed = orjson.loads(raw_body)
      if isinstance(parsed, list):
        events.extend(parsed)
      else:
        events.append(parsed)
    except Exception as exc:
      raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

  created = 0
  for event in events:
    normalized = normalize_lss_event(event)
    entry = {
      "id": str(uuid.uuid4()),
      "timestamp": event.get("timestamp") or datetime.datetime.utcnow().isoformat() + "Z",
      "level": "INFO",
      "message": normalized,
      "raw": event,
    }
    buffer.add_log(str(exhaust_id), entry)
    await error_detector.handle_log(str(exhaust_id), normalized)
    created += 1

  origin = request.headers.get("origin")
  return add_cors(JSONResponse({"status": "ok", "ingested": created}), origin)


class LogQuery(BaseModel):
  streamId: uuid.UUID
  question: str


@app.post("/logs/query")
async def query_logs(payload: LogQuery):
  logs = buffer.get_logs(str(payload.streamId), 1000)
  if not logs:
    return {"answer": "No logs available for this stream yet.", "citations": [], "rawRelevantLogs": []}
  try:
    result = await embedder.answer(logs, payload.question)
    return result
  except Exception as exc:
    return JSONResponse({"error": str(exc)}, status_code=500)


@app.get("/exhausts/{exhaust_id}/errors")
async def get_errors(exhaust_id: uuid.UUID):
  return {"items": error_detector.get_summaries(str(exhaust_id))}


@app.post("/exhausts/{exhaust_id}/search")
async def search_exhaust(exhaust_id: uuid.UUID, payload: SearchRequest, db=Depends(get_db), request: Request = None):
  exhaust = await fetch_exhaust(db, exhaust_id)
  if not exhaust:
    raise HTTPException(status_code=404, detail="Exhaust not found")

  client = AsyncOpenAI(api_key=OPENAI_API_KEY)
  emb_resp = await client.embeddings.create(
    model="text-embedding-3-large",
    input=payload.query,
  )
  embedding = emb_resp.data[0].embedding
  vector_param = "[" + ",".join(str(x) for x in embedding) + "]"
  rows = await db.fetch(
    """
    SELECT l.id, l.raw_json, l.normalized_text, e.embedding <=> $2::vector AS distance
    FROM zscaler_lss_embeddings e
    JOIN zscaler_lss_logs l ON l.id = e.log_id
    WHERE e.exhaust_id = $1
    ORDER BY e.embedding <-> $2::vector
    LIMIT $3
    """,
    exhaust_id,
    vector_param,
    payload.limit,
  )
  origin = request.headers.get("origin") if request else None
  return add_cors(JSONResponse({"results": [dict(r) for r in rows]}), origin)


@app.get("/healthz")
async def healthz():
  return add_cors(JSONResponse({"status": "ok"}))


# Apply CORS to every response (including errors)
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
  origin = request.headers.get("origin")
  try:
    response = await call_next(request)
  except Exception as exc:
    # Ensure errors still get CORS headers
    from fastapi.responses import PlainTextResponse
    response = PlainTextResponse(str(exc), status_code=500)
  return add_cors(response, origin)


@app.delete("/exhausts/{exhaust_id}")
async def delete_exhaust(exhaust_id: uuid.UUID, db=Depends(get_db), request: Request = None):
  await db.execute("DELETE FROM exhausts WHERE id = $1", exhaust_id)
  origin = request.headers.get("origin") if request else None
  return add_cors(JSONResponse({"status": "deleted"}), origin)

# CORS helpers at module scope
def resolve_origin(request_origin: Optional[str]) -> Optional[str]:
  if not request_origin:
    return None
  # Allow any origin in ALLOWED_ORIGINS; if wildcard present, echo back the origin for credentials
  if "*" in ALLOWED_ORIGINS or request_origin in ALLOWED_ORIGINS:
    return request_origin
  return None


def add_cors(resp: JSONResponse, request_origin: Optional[str] = None):
  origin = resolve_origin(request_origin)
  if origin:
    resp.headers["Access-Control-Allow-Origin"] = origin
    resp.headers["Access-Control-Allow-Credentials"] = "true"
  resp.headers[
    "Access-Control-Allow-Headers"
  ] = "Content-Type, Authorization, X-Atlas-Secret, X-Requested-With, X-Org-Id, X-Account-Id, X-License-Key"
  resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS,DELETE"
  return resp


@app.options("/{full_path:path}")
async def preflight(full_path: str, request: Request):
  return add_cors(JSONResponse({"status": "ok"}), request.headers.get("origin"))
