"""One OpenRouter chat call. DeepSeek V4.1 Flash is the default model."""

import json
import logging
from typing import Any

import httpx

from app.config import settings
from app.logging_format import log_failure

logger = logging.getLogger("testflow.agents")

_BLOCKED_MODELS = ("openai/", "anthropic/")


class ModelError(Exception):
    pass


def _allowed(model: str) -> str:
    name = (model or settings.OPENROUTER_MODEL).strip()
    if any(name.startswith(prefix) for prefix in _BLOCKED_MODELS):
        raise ModelError("Only Chinese models are allowed.")
    return name


def cost_usd(prompt_tokens: int, completion_tokens: int) -> float:
    return (
        prompt_tokens * settings.AGENT_INPUT_USD_PER_MILLION
        + completion_tokens * settings.AGENT_OUTPUT_USD_PER_MILLION
    ) / 1_000_000


def complete_json(messages: list[dict], schema: dict, *, model: str | None = None) -> tuple[dict, float]:
    """Return parsed JSON and the estimated dollar cost of the call."""
    key = (settings.OPENROUTER_API_KEY or "").strip()
    if not key:
        raise ModelError("OPENROUTER_API_KEY is not set.")
    chosen = _allowed(model or settings.OPENROUTER_MODEL)
    body = {
        "model": chosen,
        "messages": messages,
        "temperature": 0,
        "response_format": {"type": "json_schema", "json_schema": {"name": "agent", "strict": True, "schema": schema}},
    }
    try:
        response = httpx.post(
            f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=body,
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
    except ModelError:
        raise
    except Exception as exc:
        if chosen != settings.OPENROUTER_FALLBACK_MODEL:
            log_failure(logger, "agent.model", exc, level=logging.WARNING)
            return complete_json(messages, schema, model=settings.OPENROUTER_FALLBACK_MODEL)
        log_failure(logger, "agent.model", exc)
        raise ModelError("The model call failed.") from exc
    usage = payload.get("usage") or {}
    spent = cost_usd(int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0))
    content = payload["choices"][0]["message"]["content"]
    if isinstance(content, str):
        return json.loads(content), spent
    if isinstance(content, dict):
        return content, spent
    raise ModelError("The model did not return JSON.")


PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "action": {"type": "string", "enum": ["goto", "click", "fill", "press"]},
                    "target": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["action", "target", "value"],
            },
        },
        "expected": {"type": "string"},
    },
    "required": ["steps", "expected"],
}
