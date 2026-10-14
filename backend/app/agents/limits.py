"""Stop a model step or a DOM walk before it can run away."""

import time
from dataclasses import dataclass, field


class LimitReached(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


@dataclass
class LoopLimits:
    max_iterations: int
    max_cost_usd: float
    max_time_seconds: float
    max_repeats: int


PLAN_LIMITS = LoopLimits(max_iterations=3, max_cost_usd=0.50, max_time_seconds=15, max_repeats=3)
RECORD_LIMITS = LoopLimits(max_iterations=40, max_cost_usd=0.50, max_time_seconds=60, max_repeats=3)
HEAL_LIMITS = LoopLimits(max_iterations=3, max_cost_usd=0.50, max_time_seconds=70, max_repeats=3)


@dataclass
class LoopState:
    iterations: int = 0
    cost_usd: float = 0.0
    started: float = field(default_factory=time.monotonic)
    recent: list[str] = field(default_factory=list)

    def check(self, limits: LoopLimits, *, job_cost_cap: float) -> None:
        if self.recent and len(self.recent) >= limits.max_repeats and len(set(self.recent[-limits.max_repeats :])) == 1:
            raise LimitReached("repeat limit")
        if self.iterations >= limits.max_iterations:
            raise LimitReached("iteration limit")
        if self.cost_usd >= min(limits.max_cost_usd, job_cost_cap):
            raise LimitReached("cost limit")
        if time.monotonic() - self.started >= limits.max_time_seconds:
            raise LimitReached("time limit")

    def note(self, action: str, cost_usd: float) -> None:
        self.iterations += 1
        self.cost_usd += cost_usd
        self.recent.append(action)
        if len(self.recent) > 8:
            self.recent = self.recent[-8:]
