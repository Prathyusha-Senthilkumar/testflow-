from typing import Any, Callable, Optional

from rq.job import Job

from app.queue.connection import get_test_execution_queue


class QueueService:
    """Enqueue work onto the TestFlow test-execution RQ queue."""

    def enqueue(
        self,
        func: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> Job:
        queue = get_test_execution_queue()
        return queue.enqueue(func, *args, **kwargs)


_queue_service: Optional[QueueService] = None


def get_queue_service() -> QueueService:
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service
