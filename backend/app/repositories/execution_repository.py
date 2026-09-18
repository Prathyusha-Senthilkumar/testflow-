import asyncio
from typing import Dict, List, Optional
from datetime import datetime, timezone
from app.models.auth_profile import AuthProfile, AuthType
from app.models.execution import ExecutionJob, ExecutionStatus
from app.models.test_result import TestResult, TestResultStatus
from app.database import supabase_client


class ExecutionRepository:
    """
    Unified persistence layer for Auth Profiles, Executions, and Test Results.
    Supports in-memory persistence with optional Supabase synchronisation.
    Thread-safe and async-friendly.
    """

    def __init__(self):
        self.db = supabase_client
        self._lock = asyncio.Lock()
        self._auth_profiles: Dict[str, AuthProfile] = {}
        self._executions: Dict[str, ExecutionJob] = {}
        self._results: Dict[str, TestResult] = {}
        self._init_defaults()

    def _init_defaults(self):
        # Pre-seed a default demo Auth Profile
        demo_profile = AuthProfile(
            id="auth_student_01",
            name="Student Test Account",
            description="Default authorized testing session for student portal test cases",
            type=AuthType.PLAYWRIGHT_STORAGE_STATE,
            storage_state_path="auth/student.json",
            is_active=True,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat()
        )
        self._auth_profiles[demo_profile.id] = demo_profile

    # ================= AUTH PROFILES =================
    async def create_auth_profile(self, profile: AuthProfile) -> AuthProfile:
        async with self._lock:
            self._auth_profiles[profile.id] = profile
            return profile

    async def get_auth_profile(self, profile_id: str) -> Optional[AuthProfile]:
        async with self._lock:
            return self._auth_profiles.get(profile_id)

    async def list_auth_profiles(self, include_inactive: bool = True) -> List[AuthProfile]:
        async with self._lock:
            profiles = list(self._auth_profiles.values())
            if not include_inactive:
                profiles = [p for p in profiles if p.is_active]
            return sorted(profiles, key=lambda p: p.created_at, reverse=True)

    async def update_auth_profile(self, profile: AuthProfile) -> AuthProfile:
        async with self._lock:
            self._auth_profiles[profile.id] = profile
            return profile

    async def delete_auth_profile(self, profile_id: str) -> bool:
        async with self._lock:
            if profile_id in self._auth_profiles:
                # Soft delete by deactivating
                p = self._auth_profiles[profile_id]
                p.is_active = False
                p.updated_at = datetime.now(timezone.utc).isoformat()
                return True
            return False

    # ================= EXECUTIONS =================
    async def create_execution(self, job: ExecutionJob) -> ExecutionJob:
        async with self._lock:
            self._executions[job.id] = job
            return job

    async def get_execution(self, execution_id: str) -> Optional[ExecutionJob]:
        async with self._lock:
            return self._executions.get(execution_id)

    async def list_executions(self, limit: int = 50) -> List[ExecutionJob]:
        async with self._lock:
            jobs = list(self._executions.values())
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            return jobs[:limit]

    async def update_execution(self, job: ExecutionJob) -> ExecutionJob:
        async with self._lock:
            self._executions[job.id] = job
            return job

    async def claim_next_queued(self) -> Optional[ExecutionJob]:
        """Atomically dequeue the oldest QUEUED job and mark it RUNNING."""
        async with self._lock:
            queued = [j for j in self._executions.values() if j.status == ExecutionStatus.QUEUED]
            if not queued:
                return None
            queued.sort(key=lambda j: j.created_at)
            job = queued[0]
            job.status = ExecutionStatus.RUNNING
            job.started_at = datetime.now(timezone.utc).isoformat()
            job.error_message = None
            return job

    # ================= TEST RESULTS =================
    async def create_test_result(self, result: TestResult) -> TestResult:
        async with self._lock:
            self._results[result.id] = result
            return result

    async def get_test_result(self, result_id: str) -> Optional[TestResult]:
        async with self._lock:
            return self._results.get(result_id)

    async def get_result_by_execution_id(self, execution_id: str) -> Optional[TestResult]:
        async with self._lock:
            for res in self._results.values():
                if res.execution_id == execution_id:
                    return res
            return None

    async def list_results(self, limit: int = 50) -> List[TestResult]:
        async with self._lock:
            res_list = list(self._results.values())
            res_list.sort(key=lambda r: r.created_at, reverse=True)
            return res_list[:limit]

    async def list_results_for_test_case(self, test_case_id: str) -> List[TestResult]:
        async with self._lock:
            matched = [r for r in self._results.values() if r.test_case_id == test_case_id]
            matched.sort(key=lambda r: r.created_at, reverse=True)
            return matched


execution_repository = ExecutionRepository()
