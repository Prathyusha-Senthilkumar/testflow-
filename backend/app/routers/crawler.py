import uuid
from typing import Dict
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.schemas.crawler import CrawlRequest, CrawlJobStatus
from app.services.crawler_service import crawler_service
from app.services.test_generator_service import test_generator_service
from app.repositories.project_repository import ProjectRepository

router = APIRouter(prefix="/crawler", tags=["Crawler & Test Generator"])

# In-memory tracking for background crawl jobs
active_jobs: Dict[str, CrawlJobStatus] = {}
project_repo = ProjectRepository()


async def execute_crawl_and_generation(job_id: str, request: CrawlRequest):
    """
    Background worker that runs Playwright crawl, analyzes DOM, and generates test suites.
    """
    job = active_jobs.get(job_id)
    if not job:
        return

    async def update_progress(status: str, progress: int, message: str):
        job.status = status
        job.progress = progress
        job.message = message

    try:
        # Step 1: Run Crawler with Approach A Auth
        job.status = "crawling"
        job.message = f"Starting crawl on {request.base_url}"
        job.progress = 10

        discovered_pages = await crawler_service.crawl(
            base_url=request.base_url,
            max_depth=request.max_depth,
            max_pages=request.max_pages,
            auth=request.auth,
            progress_callback=update_progress
        )

        job.pages_discovered = len(discovered_pages)
        job.pages_crawled = [p.url for p in discovered_pages]
        job.progress = 75
        job.status = "generating"
        job.message = f"Analyzed {len(discovered_pages)} pages. Generating test suites and cases..."

        # Step 2: Generate QA Suites and Cases
        generated_suites = test_generator_service.generate_tests_from_crawled_pages(discovered_pages)
        job.generated_suites = generated_suites

        # Step 3: Persist to TestFlow Database/Demo Storage
        job.message = "Saving generated suites and test cases to project..."
        job.progress = 90
        project_repo.save_generated_suites(request.project_id, generated_suites)

        # Step 4: Complete
        job.progress = 100
        job.status = "completed"
        total_cases = sum(len(s.cases) for s in generated_suites)
        job.message = f"Successfully generated {len(generated_suites)} suites ({total_cases} test cases) across {len(discovered_pages)} pages."

    except Exception as e:
        print(f"[CrawlerJobError] Job {job_id} failed: {e}")
        job.status = "failed"
        job.progress = 100
        job.error = str(e)
        job.message = f"Crawl failed: {str(e)}"


@router.post("/start", response_model=CrawlJobStatus)
async def start_crawl(request: CrawlRequest, background_tasks: BackgroundTasks):
    """
    Starts an automated Playwright crawl and test generation job in the background.
    Supports Approach A credentials for authenticated testing.
    """
    job_id = f"job-{uuid.uuid4().hex[:8]}"
    status = CrawlJobStatus(
        job_id=job_id,
        project_id=request.project_id,
        status="queued",
        progress=0,
        message=f"Queued crawl for {request.base_url}"
    )
    active_jobs[job_id] = status

    background_tasks.add_task(execute_crawl_and_generation, job_id, request)
    return status


@router.get("/status/{job_id}", response_model=CrawlJobStatus)
def get_crawl_status(job_id: str):
    """
    Polls the current status, progress, discovered pages, and generated test suites of a crawl job.
    """
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Crawl job not found")
    return active_jobs[job_id]
