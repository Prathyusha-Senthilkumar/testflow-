"""Match a planned step to one button or field. The full page is not kept."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Control:
    role: str
    name: str


@dataclass(frozen=True)
class Match:
    control: Control | None
    ambiguous: tuple[Control, ...] = ()


def match_step(action: str, target: str, controls: list[Control]) -> Match:
    """Pick the control whose visible name matches the step. Empty if none or several."""
    wanted = " ".join((target or "").lower().split())
    if not wanted:
        return Match(None)
    role = {"fill": "textbox", "press": "textbox"}.get(action, "")
    pool = [item for item in controls if not role or item.role == role] or list(controls)
    exact = [item for item in pool if item.name.lower().strip() == wanted]
    if len(exact) == 1:
        return Match(exact[0])
    if len(exact) > 1:
        return Match(None, tuple(exact))
    partial = [item for item in pool if wanted in item.name.lower()]
    if len(partial) == 1:
        return Match(partial[0])
    if len(partial) > 1:
        return Match(None, tuple(partial))
    return Match(None)
