import re
from typing import Dict, List, Any
from openai import AsyncOpenAI
import os
import asyncio
import datetime

ERROR_PATTERNS = [
  r"\berror\b",
  r"policy\s+denied",
  r"denied\s+access",
  r"forbidden",
  r"unauthorized",
  r"token\s+expired",
  r"timeout",
  r"exception",
]


class ErrorDetector:
  def __init__(self, client: AsyncOpenAI):
    self.client = client
    self.summaries: Dict[str, List[Dict[str, Any]]] = {}

  def _matches(self, text: str) -> bool:
    lowered = text.lower()
    return any(re.search(pat, lowered) for pat in ERROR_PATTERNS)

  async def handle_log(self, stream_id: str, log_text: str):
    if not log_text or not self._matches(log_text):
      return
    # Fire-and-forget summarization
    asyncio.create_task(self._summarize(stream_id, log_text))

  async def _summarize(self, stream_id: str, log_text: str):
    try:
      resp = await self.client.chat.completions.create(
        model=os.getenv("OPENAI_COMPLETIONS_MODEL", "gpt-4o-mini"),
        messages=[
          {
            "role": "system",
            "content": "You summarize log error patterns and propose concise remediation steps. Keep it under 120 words.",
          },
          {"role": "user", "content": f"Log snippet:\n{log_text}\nSummarize and propose a fix."},
        ],
        temperature=0.2,
        max_tokens=200,
      )
      summary = resp.choices[0].message.content.strip()
      entry = {
        "summary": summary,
        "log_excerpt": log_text[:300],
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
      }
      arr = self.summaries.get(stream_id) or []
      arr.append(entry)
      self.summaries[stream_id] = arr[-5:]
    except Exception:
      return

  def get_summaries(self, stream_id: str) -> List[Dict[str, Any]]:
    return self.summaries.get(stream_id, [])
