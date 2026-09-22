from datetime import datetime
from typing import Any, Callable, Optional

from rq.job import Job
from rq.registry import ScheduledJobRegistry

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

    def enqueue_at(
        self,
        run_at: datetime,
        func: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> Job:
        """Schedule the same job for later on the same queue (RQ scheduler)."""
        queue = get_test_execution_queue()
        return queue.enqueue_at(run_at, func, *args, **kwargs)

    def scheduled_jobs(self) -> list[Job]:
        """Pending scheduled jobs, soonest first."""
        queue = get_test_execution_queue()
        registry = ScheduledJobRegistry(queue=queue)
        jobs: list[tuple[datetime, Job]] = []
        for job_id in registry.get_job_ids():
            try:
                job = Job.fetch(job_id, connection=queue.connection)
                jobs.append((registry.get_scheduled_time(job), job))
            except Exception:
                continue
        jobs.sort(key=lambda item: item[0])
        return [job for _, job in jobs]

    def scheduled_time(self, job: Job) -> Optional[datetime]:
        queue = get_test_execution_queue()
        try:
            return ScheduledJobRegistry(queue=queue).get_scheduled_time(job)
        except Exception:
            return None

    def cancel_scheduled(self, job_id: str) -> bool:
        queue = get_test_execution_queue()
        registry = ScheduledJobRegistry(queue=queue)
        try:
            job = Job.fetch(job_id, connection=queue.connection)
        except Exception:
            return False
        if job_id not in registry.get_job_ids():
            return False
        registry.remove(job, delete_job=True)
        return True


_queue_service: Optional[QueueService] = None


def get_queue_service() -> QueueService:
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service
