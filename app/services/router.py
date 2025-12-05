import re
from functools import lru_cache
from typing import Dict, Literal, Optional

RouteMode = Literal["agent", "integration", "datasource", "normal"]


@lru_cache(maxsize=1)
def get_mentions_catalog() -> Dict[str, set]:
    # Placeholder catalogs; replace with DB/registry lookups
    return {
        "agents": {"sales", "marketing", "support"},
        "integrations": {"slack", "jira"},
        "datasources": {"postgres", "bigquery"},
    }


def route_message(message: str) -> Dict[str, Optional[str]]:
    tokens = re.findall(r"@([\w\-]+)", message)
    catalog = get_mentions_catalog()
    for token in tokens:
        lower = token.lower()
        if lower in catalog["agents"]:
            return {"mode": "agent", "target": lower}
        if lower in catalog["integrations"]:
            return {"mode": "integration", "target": lower}
        if lower in catalog["datasources"]:
            return {"mode": "datasource", "target": lower}
    return {"mode": "normal", "target": None}


def suggest_mentions(prefix: str) -> Dict[str, list]:
    catalog = get_mentions_catalog()
    def matches(group: set) -> list:
        return [item for item in group if item.startswith(prefix.lower())]
    return {
        "agents": matches(catalog["agents"]),
        "integrations": matches(catalog["integrations"]),
        "datasources": matches(catalog["datasources"]),
    }
