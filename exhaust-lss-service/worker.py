import asyncio
import os
from typing import Any, Dict

import asyncpg
from openai import AsyncOpenAI
from redis.asyncio import Redis


DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
QUEUE_NAME = os.getenv("LSS_QUEUE", "lss_ingest_queue")


async def get_db():
  return await asyncpg.connect(DATABASE_URL)


async def process_message(db: asyncpg.Connection, client: AsyncOpenAI, entry: Dict[bytes, bytes]):
  exhaust_id = entry[b"exhaust_id"].decode()
  log_id = int(entry[b"log_id"].decode())
  text = entry[b"text"].decode()
  emb_resp = await client.embeddings.create(model="text-embedding-3-large", input=text)
  embedding = emb_resp.data[0].embedding
  vector = "[" + ",".join(str(x) for x in embedding) + "]"
  await db.execute(
    """
    INSERT INTO zscaler_lss_embeddings (exhaust_id, log_id, embedding, created_at)
    VALUES ($1, $2, $3::vector, NOW())
    """,
    exhaust_id,
    log_id,
    vector,
  )


async def worker():
  db = await get_db()
  redis = Redis.from_url(REDIS_URL)
  client = AsyncOpenAI(api_key=OPENAI_API_KEY)
  last_id = "0-0"
  try:
    while True:
      resp = await redis.xread({QUEUE_NAME: last_id}, block=5000, count=10)
      if not resp:
        continue
      for _, messages in resp:
        for msg_id, fields in messages:
          try:
            await process_message(db, client, fields)
          except Exception as err:
            print(f"[worker] failed to process {msg_id}: {err}")
          last_id = msg_id.decode()
  finally:
    await db.close()
    await redis.close()


if __name__ == "__main__":
  asyncio.run(worker())
