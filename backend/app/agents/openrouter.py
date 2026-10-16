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
        "max_tokens": 1800,
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
        content = payload["choices"][0]["message"]["content"]
        parsed = content if isinstance(content, dict) else _parse_json(content)
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
    return parsed, spent


def _parse_json(content: object) -> dict:
    if not isinstance(content, str):
        raise ValueError("The model did not return JSON.")
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("The model did not return JSON.") from None
        parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("The model did not return JSON.")
    return parsed


_STEP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "action": {"type": "string", "enum": ["goto", "click", "fill", "press"]},
        "target": {"type": "string"},
        "value": {"type": "string"},
    },
    "required": ["action", "target", "value"],
}

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "cases": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "path": {"type": "string"},
                    "steps": {"type": "array", "items": _STEP_SCHEMA},
                    "expected": {"type": "string"},
                },
                "required": ["name", "path", "steps", "expected"],
            },
        }
    },
    "required": ["cases"],
}
