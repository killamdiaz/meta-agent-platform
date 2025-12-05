from fastapi import APIRouter, Depends, HTTPException
from fastapi import BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import uuid

from app.utils.streaming import sse_event, stream_response
from app.db.repository import get_session, save_message, get_history
from app.services.router import route_message, suggest_mentions
from app.services.kb_search import run_context_search
from app.services.llm import stream_openai_response, SYSTEM_INSTRUCTION
from app.services.agents import get_agent
from app.services.integrations import run_integration
from app.utils.logger import get_logger

logger = get_logger("chat_api")
router = APIRouter(prefix="/chat", tags=["chat"])


class SendRequest(BaseModel):
    message: str
    conversationId: Optional[str] = None


@router.get("/history/{conversation_id}")
async def history(conversation_id: str, session=Depends(get_session)):
    msgs = await get_history(session, conversation_id)
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in msgs]


@router.post("/send")
async def send(payload: SendRequest, background_tasks: BackgroundTasks, session=Depends(get_session)):
    conversation_id = payload.conversationId or str(uuid.uuid4())
    user_msg_id = await save_message(session, conversation_id, "user", payload.message)

    route = route_message(payload.message)
    mention_suggestions = suggest_mentions(payload.message.split()[-1].lstrip("@")) if "@" in payload.message else {}

    async def event_stream():
        try:
            mode = route["mode"]
            target = route["target"]
            context_block = ""
            tool_context: Dict[str, Any] = {}

            if mode == "agent" and target:
                agent = get_agent(target)
                if agent:
                    tool_context = await agent.run(payload.message, {})
            elif mode == "integration" and target:
                tool_context = await run_integration(target, payload.message, {})
            elif mode == "datasource":
                tool_context = {"datasource": target}
            else:
                context_block = await run_context_search(payload.message)

            system = {"role": "system", "content": SYSTEM_INSTRUCTION}
            user = {
                "role": "user",
                "content": f"{payload.message}\n\nContext:\n{context_block}\n\nTools:\n{tool_context}",
            }
            prompt = [system, user]

            async for token in stream_openai_response(prompt):
                yield sse_event("token", token)

            # Assemble final content
            # Since we streamed, we don't have the final text; in production, buffer tokens.
            final_content = ""  # Optional: collect tokens
            assistant_id = await save_message(session, conversation_id, "assistant", final_content)
            yield sse_event("done", f'{{"messageId":"{assistant_id}","conversationId":"{conversation_id}"}}')
        except Exception as exc:
            logger.error(f"chat stream error: {exc}")
            yield sse_event("done", '{"error":"stream_failed"}')

    return StreamingResponse(event_stream(), media_type="text/event-stream")
