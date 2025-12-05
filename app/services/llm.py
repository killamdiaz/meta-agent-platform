import asyncio
from typing import Any, AsyncIterator, Dict, List, Optional
from openai import AsyncOpenAI
from app.utils.logger import get_logger

logger = get_logger("llm")
client = AsyncOpenAI()


SYSTEM_INSTRUCTION = (
    "You are Atlas Forge assistant. Respond concisely. "
    "Do not reveal chain-of-thought. Use provided tools when relevant."
)


async def stream_openai_response(prompt: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> AsyncIterator[str]:
    async def call():
        return await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=prompt,
            stream=True,
            tools=tools or None,
        )

    for attempt in range(3):
        try:
            response = await call()
            async for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
            return
        except Exception as exc:
            if attempt == 2:
                logger.error(f"LLM failed after retries: {exc}")
                raise
            await asyncio.sleep(0.5 * (attempt + 1))
