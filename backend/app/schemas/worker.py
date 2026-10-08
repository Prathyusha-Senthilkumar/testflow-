"""GET /api/workers contract. Field names are camelCase to match the worker heartbeat JSON.

Unknown heartbeat fields are dropped (pydantic ignores extras), so only these fields ever reach clients.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel

WorkerState = Literal["online", "draining", "stale"]


class WorkerSlot(BaseModel):
    index: int
    state: Literal["idle", "running"]
    jobId: Optional[str] = None
    runId: Optional[str] = None
    testCaseId: Optional[str] = None
    projectId: Optional[str] = None
    testName: Optional[str] = None
    startedAt: Optional[str] = None


class WorkerBrowser(BaseModel):
    connected: bool = False
    version: Optional[str] = None
    contexts: int = 0


class WorkerWarm(BaseModel):
    browserReady: bool = False
    spareContexts: int = 0
    browserLaunchedAt: Optional[str] = None
    testsSinceLaunch: int = 0
    lastRecycleAt: Optional[str] = None
    coldStartsAvoided: int = 0


class WorkerProcess(BaseModel):
    rssMb: float = 0
    heapUsedMb: float = 0
    uptimeSec: int = 0
    loadAvg1: float = 0
    cpuCount: int = 0


class WorkerStatus(BaseModel):
    id: str
    status: WorkerState
    heartbeatAgeSec: Optional[int] = None
    hostname: Optional[str] = None
    pid: Optional[int] = None
    version: Optional[str] = None
    startedAt: Optional[str] = None
    lastHeartbeatAt: Optional[str] = None
    concurrency: int = 0
    busy: int = 0
    idle: int = 0
    slots: List[WorkerSlot] = []
    # Null when the heartbeat key has expired (stale worker) and nothing is known.
    browser: Optional[WorkerBrowser] = None
    warm: Optional[WorkerWarm] = None
    process: Optional[WorkerProcess] = None
    processedTotal: int = 0
    failedTotal: int = 0


class WorkerTotals(BaseModel):
    workers: int = 0
    online: int = 0
    draining: int = 0
    stale: int = 0
    # Slots of online + draining workers only; stale workers are not counted.
    slots: int = 0
    busy: int = 0
    idle: int = 0


class QueueCounts(BaseModel):
    queued: int
    scheduled: int
    processing: int
    # Suite/project batches waiting in Supabase Queues; null when unknown (demo mode, not installed).
    batchesPending: Optional[int] = None


class WorkersResponse(BaseModel):
    generatedAt: str
    totals: WorkerTotals
    # Null when Redis is not configured or not reachable.
    queue: Optional[QueueCounts] = None
    workers: List[WorkerStatus] = []
    # Why the list is empty or partial; null when everything was read.
    message: Optional[str] = None
