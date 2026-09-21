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

    if sys.platform == "win32":
        worker = SimpleWorker([queue], connection=redis_conn)
    else:
        worker = Worker([queue], connection=redis_conn)

    print(f"TestFlow RQ worker listening on queue: {TEST_EXECUTION_QUEUE_NAME}")
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
