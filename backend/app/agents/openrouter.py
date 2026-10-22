"""One OpenRouter chat call. Flag 1 uses free models. Otherwise DeepSeek, then GLM."""

import json
import logging
import time
from typing import Any

import httpx

from app.config import settings
from app.logging_format import log_failure

logger = logging.getLogger("testflow.agents")

_BLOCKED_MODELS = ("openai/", "anthropic/")
# openrouter/free picks a free model that can return structured JSON. The rest are
# explicit free models that advertise the same capability, tried when one is over quota.
FREE_MODELS = (
    "openrouter/free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3.5-super-vl:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
)
_ATTEMPT_TIMEOUT_SECONDS = 12
_CHAIN_BUDGET_SECONDS = 20


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


def is_free_model(model: str) -> bool:
    name = (model or "").strip()
    return name == "openrouter/free" or name.endswith(":free")


def model_chain(preferred: str | None = None) -> list[str]:
    """Free models to try. A paid id is ignored so a quota miss never bills a paid model."""
    chosen = (preferred if preferred is not None else settings.OPENROUTER_MODEL).strip()
    chain = list(FREE_MODELS)
    if chosen and is_free_model(chosen):
        chain = [chosen, *[item for item in chain if item != chosen]]
    return [_allowed(item) for item in chain]


def should_switch_model(exc: Exception) -> bool:
    """True when this free model is over quota, unavailable, or cannot return the plan JSON."""
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in (401, 403):
            return False
        if status in (402, 404, 408, 409, 429, 500, 502, 503, 529):
            return True
        text = exc.response.text.lower()
        if status == 400 and any(token in text for token in ("response_format", "structured", "json_schema", "not support")):
            return True
        return False
    text = str(exc).lower()
    return any(token in text for token in ("rate limit", "quota", "too many requests", "did not return json"))


def complete_json(messages: list[dict], schema: dict, *, model: str | None = None) -> tuple[dict, float]:
    """Return parsed JSON and the dollar cost. Free models cost nothing."""
    key = (settings.OPENROUTER_API_KEY or "").strip()
    if not key:
        raise ModelError("OPENROUTER_API_KEY is not set.")
    if settings.OPENROUTER_USE_FREE_MODELS:
        return _complete_free(key, messages, schema, model)
    return _complete_paid(key, messages, schema, model)


def _complete_paid(key: str, messages: list[dict], schema: dict, model: str | None) -> tuple[dict, float]:
    chosen = _allowed(model or settings.OPENROUTER_MODEL)
    try:
        return _priced_call(key, chosen, messages, schema)
    except ModelError:
        raise
    except Exception as exc:
        fallback = _allowed(settings.OPENROUTER_FALLBACK_MODEL)
        if chosen == fallback:
            log_failure(logger, "agent.model", exc)
            raise ModelError("The model call failed.") from exc
        log_failure(logger, "agent.model", exc, level=logging.WARNING)
        try:
            return _priced_call(key, fallback, messages, schema)
        except ModelError:
            raise
        except Exception as fallback_error:
            log_failure(logger, "agent.model", fallback_error)
            raise ModelError("The model call failed.") from fallback_error


def _complete_free(key: str, messages: list[dict], schema: dict, model: str | None) -> tuple[dict, float]:
    """Quota, an outage, or JSON the planner cannot use moves to the next free model."""
    chain = model_chain(model if model is not None else None)
    deadline = time.monotonic() + _CHAIN_BUDGET_SECONDS
    last_error: Exception | None = None
    quota = False
    for index, chosen in enumerate(chain):
        if index and time.monotonic() >= deadline:
            break
        try:
            parsed, _usage = _call_model(key, chosen, messages, schema)
            return parsed, 0.0
        except ModelError:
            raise
        except Exception as exc:
            last_error = exc
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403):
                log_failure(logger, "agent.model", exc)
                raise ModelError("The model call failed.") from exc
            if not should_switch_model(exc):
                log_failure(logger, "agent.model", exc)
                raise ModelError("The model call failed.") from exc
            quota = quota or _is_quota(exc)
            logger.warning("event=agent_model_switch model=%s", chosen)
    log_failure(logger, "agent.model", last_error or ModelError("no model"))
    if quota:
        raise ModelError("Every free model is at its quota. Try again later.")
    raise ModelError("The model call failed.")


def _priced_call(key: str, model: str, messages: list[dict], schema: dict) -> tuple[dict, float]:
    parsed, usage = _call_model(key, model, messages, schema)
    spent = cost_usd(int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0))
    return parsed, spent


def _call_model(key: str, model: str, messages: list[dict], schema: dict) -> tuple[dict, dict]:
    response = httpx.post(
        f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": model,
            "messages": messages,
            "temperature": 0,
            "max_tokens": 4000,
            "reasoning": {"effort": "none"},
            "response_format": {"type": "json_schema", "json_schema": {"name": "agent", "strict": True, "schema": schema}},
        },
        timeout=25,
    )
    response.raise_for_status()
    payload = response.json()
    message = payload["choices"][0]["message"]
    if not isinstance(message, dict):
        raise ValueError("The model did not return JSON.")
    content = message.get("content")
    parsed = content if isinstance(content, dict) else _parse_json(_message_text(message))
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return parsed, usage


def _is_quota(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
        return True
    text = str(exc).lower()
    return any(token in text for token in ("rate limit", "quota", "too many requests"))


def _message_text(message: dict) -> str:
    """Read the plan JSON. A reasoning model may leave content empty and put the text elsewhere."""
    content = message.get("content")
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                parts.append(str(part.get("text") or part.get("content") or ""))
        content = "".join(parts)
    if isinstance(content, str) and content.strip():
        return content
    for key in ("reasoning", "reasoning_content"):
        reasoning = message.get(key)
        if isinstance(reasoning, str) and reasoning.strip():
            return reasoning
    return content if isinstance(content, str) else ""


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
