from datetime import datetime
from typing import Optional

from app.queue.job_store import TestJob, cancel_scheduled, scheduled_jobs, scheduled_time, submit_job


class QueueService:
    """Put test runs on the Redis list the Node worker reads."""

    def submit(
        self,
        *,
        config_path: str,
        project_id: Optional[str],
        test_case_code: Optional[str],
        test_case_id: Optional[str],
        headed: Optional[bool],
        time_zone: Optional[str],
        run_at: Optional[datetime],
        environment_base_url: Optional[str] = None,
    ) -> TestJob:
        return submit_job(
            config_path=config_path,
            project_id=project_id,
            test_case_code=test_case_code,
            test_case_id=test_case_id,
            headed=headed,
            time_zone=time_zone,
            run_at=run_at,
            environment_base_url=environment_base_url,
        )

    def scheduled_jobs(self) -> list[TestJob]:
        return scheduled_jobs()

    def scheduled_time(self, job: TestJob) -> Optional[datetime]:
        return scheduled_time(job)

    def cancel_scheduled(self, job_id: str) -> bool:
        return cancel_scheduled(job_id)


_queue_service: Optional[QueueService] = None


def get_queue_service() -> QueueService:
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service
