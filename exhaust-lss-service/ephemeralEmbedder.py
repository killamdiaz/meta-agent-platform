from typing import List, Dict, Any, Tuple
import math
import os
from openai import AsyncOpenAI

CHUNK_SIZE = 200
TOP_K = 5


def chunk_text(text: str, size: int = CHUNK_SIZE) -> List[str]:
  text = text or ""
  chunks = []
  for i in range(0, len(text), size):
    chunks.append(text[i:i+size])
  return chunks


def cosine(a: List[float], b: List[float]) -> float:
  if not a or not b or len(a) != len(b):
    return -1.0
  dot = sum(x*y for x, y in zip(a, b))
  norm_a = math.sqrt(sum(x*x for x in a))
  norm_b = math.sqrt(sum(x*x for x in b))
  if norm_a == 0 or norm_b == 0:
    return -1.0
  return dot / (norm_a * norm_b)


class EphemeralEmbedder:
  def __init__(self, client: AsyncOpenAI):
    self.client = client
    self.embed_model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    self.chat_model = os.getenv("OPENAI_COMPLETIONS_MODEL", "gpt-4o-mini")

  async def answer(self, logs: List[Dict[str, Any]], question: str) -> Dict[str, Any]:
    if not logs:
      return {"answer": "No logs available for this stream yet.", "citations": [], "rawRelevantLogs": []}

    # Build corpus of chunks
    corpus: List[Tuple[str, str, str]] = []  # (log_id, timestamp, chunk)
    for log in logs:
      text = f"{log.get('timestamp','')}: {log.get('message','')}"
      for chunk in chunk_text(text):
        corpus.append((str(log.get("id")), log.get("timestamp", ""), chunk))

    if not corpus:
      return {"answer": "No logs available for this stream yet.", "citations": [], "rawRelevantLogs": []}

    # Embed question
    qresp = await self.client.embeddings.create(input=question, model=self.embed_model)
    qvec = qresp.data[0].embedding

    # Embed corpus in batches, ephemeral
    chunks = [c[2] for c in corpus]
    cresp = await self.client.embeddings.create(input=chunks, model=self.embed_model)
    cvecs = [item.embedding for item in cresp.data]

    scored: List[Tuple[float, Tuple[str, str, str]]] = []
    for vec, meta in zip(cvecs, corpus):
      scored.append((cosine(qvec, vec), meta))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:TOP_K]

    citations = []
    raw_logs = []
    context_lines = []
    for score, (log_id, ts, chunk) in top:
      citations.append({"logId": log_id, "excerpt": chunk})
      context_lines.append(f"[{log_id} @ {ts}] {chunk}")
    # Build LLM prompt
    context = "\n".join(context_lines)
    prompt = f"""You are a log intelligence assistant. Answer the question using ONLY the log excerpts provided.
Add inline citations using [logId] after the sentences they support.
If information is missing, say so briefly.

Question: {question}

Log Context:
{context}
"""
    chat = await self.client.chat.completions.create(
      model=self.chat_model,
      messages=[{"role": "user", "content": prompt}],
      temperature=0.2,
      max_tokens=400,
    )
    answer = chat.choices[0].message.content.strip()
    # Collect raw logs for convenience
    seen_ids = set([c["logId"] for c in citations])
    for log in logs:
      if str(log.get("id")) in seen_ids:
        raw_logs.append(log)

    return {"answer": answer, "citations": citations, "rawRelevantLogs": raw_logs}
