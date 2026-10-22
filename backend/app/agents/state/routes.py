"""One comparison for every route a tester or the model writes down.

Users paste full URLs, bare paths, hosts without a scheme, trailing slashes,
hashes, and tracking parameters. Matching uses the pathname.
"""

import re
from urllib.parse import parse_qsl, unquote, urlencode, urlparse

_TRACKING = {"fbclid", "gclid", "gclsrc", "mc_cid", "mc_eid", "_ga"}
_HOST_PATH = re.compile(r"^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?/", re.IGNORECASE)
_PASTED = re.compile(
    r"https?://[^\s<>\"']+"
    r"|//[^\s<>\"']+"
    r"|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?/[^\s<>\"']+"
    r"|/[a-z0-9][^\s<>\"']*",
    re.IGNORECASE,
)


def route_key(value: str) -> str:
    """Pathname plus the query that identifies the screen. Empty when this is not a route."""
    text = (value or "").strip().strip("<>\"'").strip().rstrip(".,);")
    if not text or " " in text:
        return ""
    if text.startswith("//"):
        text = "https:" + text
    elif "://" not in text and (_HOST_PATH.match(text) or text.lower().startswith("www.")):
        text = "https://" + text
    elif "://" not in text and not text.startswith("/"):
        text = "/" + text.lstrip("/")
    parsed = urlparse(text)
    path = unquote(parsed.path or "/")
    path = re.sub(r"/+", "/", path).rstrip("/") or "/"
    path = path.lower()
    params = []
    for key, item in parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in _TRACKING or lowered.startswith("utm_"):
            continue
        params.append((lowered, item))
    params.sort()
    query = urlencode(params)
    return f"{path}?{query}" if query else path


def pasted_routes(text: str) -> list[str]:
    """Routes written inside a prompt, in the order they appear."""
    found: list[str] = []
    for match in _PASTED.finditer(text or ""):
        token = match.group(0).rstrip(".,);")
        if route_key(token):
            found.append(token)
    return found


def match_route(pages: list[dict], value: str) -> str:
    """Return the discovered path for this pasted or model route. Empty when none matches."""
    wanted = route_key(value)
    if not wanted:
        return ""
    wanted_path = wanted.split("?", 1)[0]
    exact: list[str] = []
    same_path: list[str] = []
    for page in pages:
        raw = str(page.get("path") or "").strip()
        found = route_key(raw)
        if not found:
            continue
        if found == wanted:
            exact.append(raw)
        elif found.split("?", 1)[0] == wanted_path:
            same_path.append(raw)
    exact = list(dict.fromkeys(exact))
    if exact:
        return exact[0]
    same_path = list(dict.fromkeys(same_path))
    bare = [item for item in same_path if "?" not in item]
    if len(bare) == 1:
        return bare[0]
    if len(same_path) == 1:
        return same_path[0]
    return ""


def resolve_route(pages: list[dict], path: str, prompt: str = "") -> str:
    """Use the model path when it is a discovered screen. Otherwise use the one URL in the prompt."""
    found = match_route(pages, path)
    if found:
        return found
    pasted = list(dict.fromkeys(item for item in (match_route(pages, token) for token in pasted_routes(prompt)) if item))
    if len(pasted) == 1:
        return pasted[0]
    return ""
