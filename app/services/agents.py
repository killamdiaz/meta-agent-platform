from typing import Protocol, Dict, Any


class ToolAgent(Protocol):
    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        ...


# Placeholder registry
AGENT_REGISTRY: Dict[str, ToolAgent] = {}


def get_agent(name: str) -> ToolAgent | None:
    return AGENT_REGISTRY.get(name)
