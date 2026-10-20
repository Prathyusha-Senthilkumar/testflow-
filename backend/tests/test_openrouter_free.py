import httpx

from app.agents import openrouter
from app.agents.openrouter import FREE_MODELS, is_free_model, model_chain, should_switch_model
from app.config import settings


def _status(code: int, body: str = "") -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    response = httpx.Response(code, text=body, request=request)
    return httpx.HTTPStatusError("failed", request=request, response=response)


def test_chain_starts_with_the_free_router_and_skips_paid_models():
    chain = model_chain("deepseek/deepseek-v4.1-flash")
    assert chain[0] == "openrouter/free"
    assert "deepseek/deepseek-v4.1-flash" not in chain
    assert "z-ai/glm-5.3-flash" not in chain
    assert all(is_free_model(item) for item in chain)
    assert chain == list(FREE_MODELS)


def test_a_chosen_free_model_is_tried_first():
    chain = model_chain("google/gemma-4-31b-it:free")
    assert chain[0] == "google/gemma-4-31b-it:free"
    assert chain.count("google/gemma-4-31b-it:free") == 1


def test_quota_switches_and_a_rejected_key_does_not():
    assert should_switch_model(_status(429, "Rate limit exceeded"))
    assert should_switch_model(ValueError("The model did not return JSON."))
    assert not should_switch_model(_status(401, "Unauthorized"))
    assert not should_switch_model(_status(400, "The schema field cases is invalid"))


def test_quota_moves_to_the_next_free_model():
    calls = []

    def fake(key, model, messages, schema):
        calls.append(model)
        if len(calls) == 1:
            raise _status(429, "rate limit")
        return {"cases": []}, {}

    original = openrouter._call_model
    previous_key = settings.OPENROUTER_API_KEY
    previous_flag = settings.OPENROUTER_USE_FREE_MODELS
    settings.OPENROUTER_API_KEY = previous_key or "test-key"
    settings.OPENROUTER_USE_FREE_MODELS = True
    openrouter._call_model = fake
    try:
        parsed, spent = openrouter.complete_json([{"role": "user", "content": "hi"}], {"type": "object"})
    finally:
        openrouter._call_model = original
        settings.OPENROUTER_API_KEY = previous_key
        settings.OPENROUTER_USE_FREE_MODELS = previous_flag
    assert calls == [FREE_MODELS[0], FREE_MODELS[1]]
    assert spent == 0.0
    assert parsed == {"cases": []}


def test_flag_off_uses_deepseek_then_glm():
    calls = []

    def fake(key, model, messages, schema):
        calls.append(model)
        if model == "deepseek/deepseek-v4.1-flash":
            raise RuntimeError("temporary")
        return {"cases": []}, {"prompt_tokens": 1000, "completion_tokens": 0}

    original = openrouter._call_model
    previous_key = settings.OPENROUTER_API_KEY
    previous_flag = settings.OPENROUTER_USE_FREE_MODELS
    previous_model = settings.OPENROUTER_MODEL
    previous_fallback = settings.OPENROUTER_FALLBACK_MODEL
    settings.OPENROUTER_API_KEY = previous_key or "test-key"
    settings.OPENROUTER_USE_FREE_MODELS = False
    settings.OPENROUTER_MODEL = "deepseek/deepseek-v4.1-flash"
    settings.OPENROUTER_FALLBACK_MODEL = "z-ai/glm-5.3-flash"
    openrouter._call_model = fake
    try:
        parsed, spent = openrouter.complete_json([{"role": "user", "content": "hi"}], {"type": "object"})
    finally:
        openrouter._call_model = original
        settings.OPENROUTER_API_KEY = previous_key
        settings.OPENROUTER_USE_FREE_MODELS = previous_flag
        settings.OPENROUTER_MODEL = previous_model
        settings.OPENROUTER_FALLBACK_MODEL = previous_fallback
    assert calls == ["deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash"]
    assert spent == openrouter.cost_usd(1000, 0)
    assert parsed == {"cases": []}
