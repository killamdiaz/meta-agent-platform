from typing import AsyncIterator
from fastapi.responses import StreamingResponse


def sse_event(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def stream_response(generator: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(generator, media_type="text/event-stream")
