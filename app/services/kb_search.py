import asyncio
from typing import List


async def search_forge_embeddings(query: str) -> str:
    # TODO: replace with actual pgvector search
    return f"[Forge KB match for '{query}']"


async def search_jira_embeddings(query: str) -> str:
    # TODO: replace with actual Jira pgvector search
    return f"[Jira match for '{query}']"


async def run_context_search(query: str) -> str:
    forge_task = asyncio.create_task(search_forge_embeddings(query))
    jira_task = asyncio.create_task(search_jira_embeddings(query))
    results: List[str] = await asyncio.gather(forge_task, jira_task)
    return "\n".join([r for r in results if r])
