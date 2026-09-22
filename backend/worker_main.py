"""
Standalone RQ worker for TestFlow test execution jobs.

Run from the backend directory so the `app` package resolves the same way as FastAPI.
"""

import sys

from rq.worker import SimpleWorker, Worker

from app.queue.connection import (
    TEST_EXECUTION_QUEUE_NAME,
    get_redis_connection,
    get_test_execution_queue,
)


def main() -> None:
    redis_conn = get_redis_connection()
    queue = get_test_execution_queue()

    # The scheduler process powers Scheduled Runs; it needs fork support, so it is
    # enabled for the containerised worker and skipped for local Windows runs.
    if sys.platform == "win32":
        worker = SimpleWorker([queue], connection=redis_conn)
        with_scheduler = False
    else:
        worker = Worker([queue], connection=redis_conn)
        with_scheduler = True

    print(f"TestFlow RQ worker listening on queue: {TEST_EXECUTION_QUEUE_NAME}")
    if not with_scheduler:
        print("Scheduled runs are disabled on this platform; use the Docker worker.")
    worker.work(with_scheduler=with_scheduler)


if __name__ == "__main__":
    main()
