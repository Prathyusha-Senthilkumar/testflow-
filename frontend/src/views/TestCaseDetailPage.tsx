"use client";

import { LoadingArea } from "@/components/common/LoadingArea";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarClock, ChevronDown, Copy, Ellipsis, FileQuestion, Pencil, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "@/lib/navigation";
import {
  api,
  type AssertionConfig,
  type AssertionType,
  type AuthProfileSummary,
  type EnvironmentSummary,
  type ScheduledExecution,
  type StorageEntry,
  type StorageKind,
  type TestCaseCategory,
  type TestCaseScenario,
  type TestCaseSummary,
  type TestCaseVersionDetail,
  type TestCaseVersionSummary,
  type TestRunHistoryItem,
  type TestRunResult,
  type TestSuiteSummary,
  type UpdateTestCaseInput,
} from "@/lib/api";
import { DRAFT_TEST_NAME } from "@/lib/createDraftTestCase";
import { browserTimeZone, supportedTimeZones, zonedWallTimeToUtc } from "@/lib/scheduleTime";
import type { SuiteCategory } from "@/lib/suiteCategory";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { testCaseLabel, usePublishEntityName } from "@/components/layout/shell-context";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailsPanel } from "@/components/test-cases/DetailsPanel";
import { ResultPanel } from "@/components/test-cases/ResultPanel";
import { SchedulePanel } from "@/components/test-cases/SchedulePanel";
import { StoragePanel } from "@/components/test-cases/StoragePanel";
import { StepsTab } from "@/components/test-cases/StepsTab";
import { RunsChart } from "@/components/test-cases/RunsChart";
import { RunsTab, type RunRow } from "@/components/test-cases/RunsTab";
import { RunSplitButton } from "@/components/test-cases/RunSplitButton";
import { RunSummaryStrip } from "@/components/test-cases/RunSummaryStrip";
import { resolveExpectedResult, testCaseStatusLabel, whenVisible } from "@/components/test-cases/testCaseFormat";

// Only needed on demand; keep them out of the initial bundle.
const ScriptEditorModal = dynamic(() => import("@/components/test-cases/ScriptEditorModal"), { ssr: false });
const VersionHistoryPanel = dynamic(
  () => import("@/components/test-cases/VersionHistoryPanel").then((module) => module.VersionHistoryPanel),
  { ssr: false }
);

const TABS = ["steps", "runs", "history"] as const;
type DetailTab = (typeof TABS)[number];
/** Old tab names (Overview / Script / Versions / Settings) map onto the new layout. */
const LEGACY_TABS: Record<string, DetailTab> = { overview: "steps", script: "steps", versions: "history", settings: "steps" };

const RUN_POLL_MS = 2000;
const HISTORY_POLL_MS = 4000;

const isLive = (status: string) => status === "Queued" || status === "Running";

/** PATCH payload plus fields the backend may not accept yet (sent; persistence is verified). */
type ExtendedUpdate = UpdateTestCaseInput & { assertions?: AssertionConfig[]; name?: string; description?: string };

/** Waits for the queued run to finish, reporting tester-facing progress only. Pauses while the tab is hidden. */
async function waitForExecution(jobId: string, onPhase: (phase: string) => void) {
  for (;;) {
    await whenVisible();
    const status = await api.getExecution(jobId);
    if (status.state === "completed" || status.state === "failed") return status;
    onPhase(status.state === "running" ? "Running test..." : "Preparing test...");
    await new Promise((resolve) => setTimeout(resolve, RUN_POLL_MS));
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function newAssertionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `a-${Date.now()}`;
}

function DetailSkeleton() {
  return (
    <PageContainer width="detail">
      <LoadingArea
        loading
        label="Loading test case…"
        skeleton={
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-72" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-[420px] w-full" />
            </div>
          </div>
        }
      />
    </PageContainer>
  );
}

export function TestCaseDetailPage() {
  const { id: projectId = "", caseId: testCaseId = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { pathname } = useLocation();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") ?? "";
  const tab: DetailTab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as DetailTab) : (LEGACY_TABS[tabParam] ?? "steps");
  const isNew = searchParams?.get("new") === "1";
  const wantsEdit = searchParams?.get("edit") === "1" || tabParam === "settings";
  const fromParam = searchParams?.get("from") ?? "";

  /** Rewrites the query string, keeping `tab` and dropping keys set to null. */
  const setQuery = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      if (params.get("tab") === "steps") params.delete("tab");
      const query = params.toString();
      navigate(query ? `${pathname}?${query}` : pathname, { replace: true });
    },
    [navigate, pathname, searchParams]
  );
  const setTab = useCallback((next: DetailTab) => setQuery({ tab: next }), [setQuery]);

  const [testCase, setTestCase] = useState<TestCaseSummary | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [authProfiles, setAuthProfiles] = useState<AuthProfileSummary[]>([]);
  const [suites, setSuites] = useState<TestSuiteSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState<string>("");
  const [executionCategories, setExecutionCategories] = useState<SuiteCategory[]>([]);
  const [applicableEnvironmentIds, setApplicableEnvironmentIds] = useState<string[]>([]);
  const [authProfileId, setAuthProfileId] = useState<string>("");
  const [startPath, setStartPath] = useState("/");
  const [resolvedPreview, setResolvedPreview] = useState("");
  const [category, setCategory] = useState<TestCaseCategory>("Functional");
  const [scenario, setScenario] = useState<TestCaseScenario>("Happy Path");
  const [expectedResult, setExpectedResult] = useState("");
  const [assertions, setAssertions] = useState<AssertionConfig[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [suiteIdDraft, setSuiteIdDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  /** Bumped to restart history polling (e.g. right after a run is queued). */
  const [historyKey, setHistoryKey] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  /** Load failure or the last action error. */
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [lastResult, setLastResult] = useState<TestRunResult | null>(null);
  const [runPhase, setRunPhase] = useState("");
  const [storageSeeds, setStorageSeeds] = useState<StorageEntry[]>([]);
  const [storageAssertions, setStorageAssertions] = useState<StorageEntry[]>([]);
  const [storageMode, setStorageMode] = useState<"seed" | "assert">("seed");
  const [storageKind, setStorageKind] = useState<StorageKind>("localStorage");
  const [storageKey, setStorageKey] = useState("");
  const [storageValue, setStorageValue] = useState("");

  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleZone, setScheduleZone] = useState("UTC");
  const [detectedZone, setDetectedZone] = useState("UTC");
  const [zoneOverridden, setZoneOverridden] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const timeZones = supportedTimeZones();
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledExecution[]>([]);
  const [caseRuns, setCaseRuns] = useState<TestRunHistoryItem[]>([]);

  const [scriptOpen, setScriptOpen] = useState(false);
  /** Saved script source shown read-only in Steps; `null` until loaded. */
  const [scriptSource, setScriptSource] = useState<string | null>(null);
  /** Draft edited in the script editor modal. */
  const [scriptContent, setScriptContent] = useState("");
  const [scriptPath, setScriptPath] = useState("");
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptSaving, setScriptSaving] = useState(false);

  const [versions, setVersions] = useState<TestCaseVersionSummary[] | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<TestCaseVersionDetail | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);

  const hasScript = Boolean(testCase?.testFile) && testCase?.automationStatus === "Automated";
  const scriptMissing = Boolean(testCase?.testFile) && testCase?.automationStatus !== "Automated";
  const selectedAuthProfile = authProfiles.find((profile) => profile.id === authProfileId);

  usePublishEntityName("testCase", testCaseId, testCase ? testCaseLabel(testCase.code, testCase.name) : null);

  /** Action failures: toast now, and keep the message for inline display. */
  function reportError(message: string) {
    setError(message);
    toast.error(message);
  }

  /** Copies a loaded/saved test case into the editable state (also used to cancel edits). */
  function applyTestCase(data: TestCaseSummary) {
    setTestCase(data);
    const savedEnvironmentId = data.environmentId && data.environmentId !== "env-default" ? data.environmentId : "";
    const savedEnvironments = (data.environmentIds ?? []).filter((id) => id && id !== "env-default");
    if (savedEnvironments.length === 0 && savedEnvironmentId) savedEnvironments.push(savedEnvironmentId);
    setEnvironmentId(savedEnvironments[0] ?? savedEnvironmentId);
    setAuthProfileId(data.authProfileId ?? "");
    setStartPath(data.startPath ?? "/");
    setResolvedPreview(data.resolvedStartUrl ?? "");
    setCategory(data.category ?? "Functional");
    setExecutionCategories((data.categories ?? []) as SuiteCategory[]);
    setApplicableEnvironmentIds(savedEnvironments);
    setScenario(data.scenario ?? "Happy Path");
    setExpectedResult(resolveExpectedResult(data));
    setStorageSeeds(data.storageSeeds ?? []);
    setStorageAssertions(data.storageAssertions ?? []);
    setAssertions(data.assertions ?? []);
    setNameDraft(data.name);
    setDescriptionDraft(data.description ?? "");
    setSuiteIdDraft(data.suiteId ?? "");
  }

  useEffect(() => {
    const detected = browserTimeZone();
    setDetectedZone(detected);
    if (!zoneOverridden) setScheduleZone(detected);
  }, [zoneOverridden]);

  useEffect(() => {
    if (!projectId || !testCaseId) return;
    setLoading(true);
    setError("");
    Promise.all([api.testCase(projectId, testCaseId), api.environments(projectId), api.authProfiles(projectId)])
      .then(([data, envs, profiles]) => {
        setEnvironments(envs);
        setAuthProfiles(profiles);
        applyTestCase(data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Suites only label/edit the Suite field; never block the page on them.
    api
      .testSuites(projectId)
      .then(setSuites)
      .catch(() => setSuites([]));
  }, [projectId, testCaseId]);

  // `?edit=1` (new drafts, Edit links, old `?tab=settings`): open inline edit mode once loaded.
  const editApplied = useRef(false);
  useEffect(() => {
    if (!testCase || editApplied.current || !wantsEdit) return;
    editApplied.current = true;
    setEditing(true);
    if (tabParam === "settings") setQuery({ tab: null, edit: "1" });
  }, [testCase, wantsEdit, tabParam, setQuery]);

  // Focus the inline title (text selected) when entering edit mode.
  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  // Run history + upcoming schedules. Polls only while a run is queued or
  // running, stops at terminal states, and pauses while the tab is hidden.
  useEffect(() => {
    if (!testCaseId) return;
    let cancelled = false;
    let live = true;
    let timer: number | undefined;

    const scheduleNext = () => {
      window.clearTimeout(timer);
      if (cancelled || !live || document.hidden) return;
      timer = window.setTimeout(load, HISTORY_POLL_MS);
    };

    function load() {
      Promise.all([api.scheduledExecutions(testCaseId), api.testRuns(20, testCaseId)])
        .then(([upcoming, runs]) => {
          if (cancelled) return;
          setScheduled(upcoming);
          setCaseRuns(runs);
          live = runs.some((item) => isLive(item.status));
        })
        .catch(() => {
          if (!cancelled) setScheduled([]);
        })
        .finally(() => {
          if (!cancelled) setHistoryLoaded(true);
          scheduleNext();
        });
    }

    const onVisibilityChange = () => {
      if (document.hidden || !live || cancelled) return;
      window.clearTimeout(timer);
      load();
    };

    load();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [testCaseId, historyKey]);

  // Saved script source for the Steps view.
  const testFile = testCase?.testFile ?? "";
  useEffect(() => {
    if (!projectId || !testCaseId || loading) return;
    if (!testFile) {
      setScriptSource("");
      return;
    }
    let cancelled = false;
    setScriptSource(null);
    api
      .getTestScript(projectId, testCaseId)
      .then((data) => {
        if (cancelled) return;
        setScriptSource(data.content);
        setScriptPath(data.testFile);
      })
      .catch(() => {
        if (!cancelled) setScriptSource("");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, testCaseId, testFile, loading]);

  // Versions load when History is first opened.
  useEffect(() => {
    if (tab !== "history" || versions !== null || !projectId || !testCaseId) return;
    let cancelled = false;
    api
      .testCaseVersions(projectId, testCaseId)
      .then((items) => {
        if (!cancelled) setVersions(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVersions([]);
        reportError(errorMessage(err, "Could not load version history"));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, versions, projectId, testCaseId]);

  useEffect(() => {
    if (!projectId) return;
    const timer = window.setTimeout(() => {
      api
        .resolveStartUrl(projectId, startPath, environmentId)
        .then((data) => setResolvedPreview(data.resolvedStartUrl))
        .catch(() => setResolvedPreview(""));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [projectId, startPath, environmentId]);

  function changeApplicableEnvironments(ids: string[]) {
    setApplicableEnvironmentIds(ids);
    setEnvironmentId((current) => (ids.includes(current) ? current : ids[0] ?? ""));
  }

  /** The editable fields, as sent with every save/record/run. */
  function basePayload(overrides: Partial<ExtendedUpdate> = {}): ExtendedUpdate {
    return {
      environmentId,
      authProfileId: authProfileId || null,
      startPath,
      expectedResult: expectedResult.trim() || null,
      category,
      categories: executionCategories,
      environmentIds: applicableEnvironmentIds,
      scenario,
      storageSeeds,
      storageAssertions,
      assertions,
      ...overrides,
    };
  }

  const patch = (input: ExtendedUpdate) => api.updateTestCase(projectId, testCaseId, input as UpdateTestCaseInput);

  // Unsaved changes: compare the editable state with the loaded test case.
  const snapshot = useCallback(
    (source: {
      name: string;
      description: string;
      suiteId: string;
      environmentIds: string[];
      authProfileId: string;
      startPath: string;
      expectedResult: string;
      category: string;
      categories: string[];
      scenario: string;
      storageSeeds: StorageEntry[];
      storageAssertions: StorageEntry[];
      assertions: AssertionConfig[];
    }) => JSON.stringify(source),
    []
  );
  const dirty = useMemo(() => {
    if (!testCase || !editing) return false;
    const saved = (testCase.environmentIds ?? []).filter((id) => id && id !== "env-default");
    return (
      snapshot({
        name: nameDraft.trim(),
        description: descriptionDraft.trim(),
        suiteId: suiteIdDraft,
        environmentIds: applicableEnvironmentIds,
        authProfileId,
        startPath,
        expectedResult: expectedResult.trim(),
        category,
        categories: executionCategories,
        scenario,
        storageSeeds,
        storageAssertions,
        assertions,
      }) !==
      snapshot({
        name: testCase.name,
        description: testCase.description ?? "",
        suiteId: testCase.suiteId ?? "",
        environmentIds: saved.length ? saved : testCase.environmentId && testCase.environmentId !== "env-default" ? [testCase.environmentId] : [],
        authProfileId: testCase.authProfileId ?? "",
        startPath: testCase.startPath ?? "/",
        expectedResult: resolveExpectedResult(testCase).trim(),
        category: testCase.category ?? "Functional",
        categories: testCase.categories ?? [],
        scenario: testCase.scenario ?? "Happy Path",
        storageSeeds: testCase.storageSeeds ?? [],
        storageAssertions: testCase.storageAssertions ?? [],
        assertions: testCase.assertions ?? [],
      })
    );
  }, [
    testCase,
    editing,
    snapshot,
    nameDraft,
    descriptionDraft,
    suiteIdDraft,
    applicableEnvironmentIds,
    authProfileId,
    startPath,
    expectedResult,
    category,
    executionCategories,
    scenario,
    storageSeeds,
    storageAssertions,
    assertions,
  ]);

  // Leaving the page (reload/close) with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** Moves the test between suites when the Suite field changed (membership API). */
  async function syncSuite(previous: string, next: string) {
    if (previous === next) return;
    if (previous) await api.removeTestCaseFromSuite(projectId, previous, testCaseId);
    if (next) await api.addTestCasesToSuite(projectId, next, [testCaseId]);
  }

  /** Saves the editable fields. Resolves `true` on success. */
  async function handleSave({ notify = true }: { notify?: boolean } = {}): Promise<boolean> {
    if (!projectId || !testCaseId || !testCase) return false;
    const name = nameDraft.trim() || testCase.name;
    const description = descriptionDraft.trim();
    if (!nameDraft.trim()) setNameDraft(testCase.name);
    setSaving(true);
    setError("");
    try {
      const updated = await patch(basePayload({ name, description }));
      try {
        await syncSuite(testCase.suiteId ?? "", suiteIdDraft);
        updated.suiteId = suiteIdDraft || null;
      } catch (err) {
        toast.error(errorMessage(err, "Couldn’t change the suite"));
      }
      applyTestCase(updated);
      if (notify) {
        toast.success("Test case saved");
      }
      return true;
    } catch (err) {
      reportError(errorMessage(err, "Could not save test case"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function exitEditMode() {
    setEditing(false);
    setQuery({ edit: null, new: null, from: null });
  }

  async function saveEdits() {
    if (await handleSave()) exitEditMode();
  }

  /** Asks before throwing away unsaved edits (in-app); resolves true when it's fine to continue. */
  async function confirmLeave(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "Your changes to this test case haven’t been saved.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      tone: "danger",
    });
  }

  async function cancelEdits() {
    if (!(await confirmLeave())) return;
    if (testCase) applyTestCase(testCase);
    exitEditMode();
  }

  function startEditing() {
    setTab("steps");
    setEditing(true);
  }

  /** Where Discard draft returns to: the page that created it (suite or list). */
  const returnPath =
    fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")
      ? fromParam
      : testCase?.suiteId
        ? `/projects/${projectId}/suites/${testCase.suiteId}`
        : `/projects/${projectId}/test-cases`;

  async function discardDraft() {
    if (!projectId || !testCaseId || !testCase) return;
    const discarded = await confirm({
      title: "Discard this draft?",
      description: (
        <>
          <strong>{nameDraft.trim() || testCase.name}</strong> and anything recorded for it will be deleted.
        </>
      ),
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
      tone: "danger",
      onConfirm: async () => {
        await api.deleteTestCase(projectId, testCaseId);
      },
    });
    if (!discarded) return;
    toast.success("Draft discarded");
    navigate(returnPath, { replace: true });
  }

  async function handlePublish() {
    if (!projectId || !testCaseId) return;
    setPublishing(true);
    setError("");
    try {
      if (editing) await handleSave({ notify: false });
      const updated = await api.publishTestCase(projectId, testCaseId);
      setTestCase(updated);
      setVersions(null);
      toast.success("Test case published", { description: testCaseStatusLabel(updated) });
    } catch (err) {
      reportError(errorMessage(err, "Could not publish test case"));
    } finally {
      setPublishing(false);
    }
  }

  async function openScriptEditor() {
    if (!projectId || !testCaseId) return;
    setScriptOpen(true);
    if (scriptSource !== null) {
      setScriptContent(scriptSource);
      return;
    }
    setScriptLoading(true);
    setError("");
    try {
      const data = await api.getTestScript(projectId, testCaseId);
      setScriptContent(data.content);
      setScriptPath(data.testFile);
    } catch (err) {
      reportError(errorMessage(err, "Could not load script"));
      setScriptContent("");
    } finally {
      setScriptLoading(false);
    }
  }

  async function handleSaveScript() {
    if (!projectId || !testCaseId) return;
    setScriptSaving(true);
    setError("");
    try {
      const updated = await api.saveTestScript(projectId, testCaseId, scriptContent);
      setTestCase(updated);
      setScriptSource(scriptContent);
      toast.success("Script saved");
    } catch (err) {
      reportError(errorMessage(err, "Could not save script"));
    } finally {
      setScriptSaving(false);
    }
  }

  async function handleRecord() {
    if (!projectId || !testCaseId) return;
    setRecording(true);
    setError("");
    setTab("steps");
    try {
      await patch(basePayload());
      const updated = await api.recordTestCase(projectId, testCaseId);
      setTestCase(updated);
      // Refresh the steps (and the editor if it is open).
      const data = await api.getTestScript(projectId, testCaseId);
      setScriptSource(data.content);
      setScriptContent(data.content);
      setScriptPath(data.testFile);
      toast.success("Recording saved");
    } catch (err) {
      reportError(errorMessage(err, "Recording failed"));
    } finally {
      setRecording(false);
    }
  }

  /** Starts a run in place: the live row shows in the Runs tab and the user stays on the page. */
  async function handleRun(environmentOverride?: string) {
    if (!projectId || !testCaseId || !hasScript) return;
    const runEnvironmentId = environmentOverride ?? environmentId;
    if (environmentOverride) setEnvironmentId(environmentOverride);
    setRunning(true);
    setError("");
    setLastResult(null);
    setRunPhase("Preparing test...");
    setTab("runs");
    try {
      const updated = await patch(basePayload({ environmentId: runEnvironmentId }));
      setTestCase(updated);
      const scriptFile = updated.testFile ?? testCase?.testFile;
      if (!scriptFile) {
        throw new Error("This test case has no recorded steps yet. Record it first, then run it.");
      }
      const execution = await api.startExecution({
        projectId,
        testCaseId: updated.id,
        testCaseCode: updated.code,
        scriptPath: scriptFile,
      });
      toast("Run queued", { description: `${updated.code} · ${updated.name}` });
      // Pick up the queued run in the history (polling continues while it is live).
      setHistoryKey((key) => key + 1);
      const finished = await waitForExecution(execution.jobId, setRunPhase);
      setRunPhase("Retrieving result...");
      const payload = finished.result;
      const result: TestRunResult = {
        status: finished.state === "completed" && payload?.success ? "Passed" : "Failed",
        duration: (payload?.durationMs ?? 0) / 1000,
        error: payload?.errorMessage ?? finished.error ?? null,
        testRunId: finished.testRunId ?? null,
      };
      setLastResult(result);
      const viewResult = result.testRunId
        ? { label: "View result", onClick: () => navigate(`/projects/${projectId}/results/${result.testRunId}`) }
        : undefined;
      if (result.status === "Passed") toast.success(`Passed in ${result.duration.toFixed(1)}s`, { action: viewResult });
      else toast.error("Run failed", { description: result.error?.split(/\r?\n/)[0] ?? undefined, action: viewResult });
    } catch (err) {
      reportError(errorMessage(err, "Test run failed"));
    } finally {
      setRunning(false);
      setRunPhase("");
      setHistoryKey((key) => key + 1);
    }
  }

  async function refreshScheduled() {
    if (!testCaseId) return;
    try {
      const [upcoming, runs] = await Promise.all([api.scheduledExecutions(testCaseId), api.testRuns(20, testCaseId)]);
      setScheduled(upcoming);
      setCaseRuns(runs);
    } catch {
      setScheduled([]);
    }
  }

  async function handleSchedule() {
    if (!projectId || !testCaseId || !hasScript) return;
    if (!scheduleDate || !scheduleTime || !scheduleZone) {
      setScheduleError("Pick a date, time, and timezone.");
      return;
    }
    let runAtIso: string;
    try {
      runAtIso = zonedWallTimeToUtc(scheduleDate, scheduleTime, scheduleZone).toISOString();
    } catch (err) {
      setScheduleError(errorMessage(err, "Choose a valid date and time."));
      return;
    }
    setScheduling(true);
    setScheduleError("");
    setError("");
    try {
      const updated = await patch(basePayload());
      setTestCase(updated);
      const scriptFile = updated.testFile ?? testCase?.testFile;
      if (!scriptFile) {
        throw new Error("This test case has no recorded steps yet. Record it first, then run it.");
      }
      await api.startExecution({
        projectId,
        testCaseId: updated.id,
        testCaseCode: updated.code,
        scriptPath: scriptFile,
        runAt: runAtIso,
        timeZone: scheduleZone,
      });
      setScheduleDate("");
      setScheduleTime("");
      await refreshScheduled();
      toast.success("Run scheduled");
    } catch (err) {
      reportError(errorMessage(err, "Could not schedule this test"));
    } finally {
      setScheduling(false);
    }
  }

  async function cancelSchedule(jobId: string) {
    try {
      await api.cancelScheduledExecution(jobId);
      await refreshScheduled();
      toast.success("Scheduled run cancelled");
    } catch (err) {
      reportError(errorMessage(err, "Could not cancel the scheduled run"));
    }
  }

  function openSchedule() {
    setScheduleOpen(true);
    window.requestAnimationFrame(() => scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addStorageEntry() {
    const key = storageKey.trim();
    if (!key) {
      setStorageError(storageKind === "cookie" ? "Cookie name is required" : "Storage key is required");
      return;
    }
    setStorageError("");
    const entry: StorageEntry = { kind: storageKind, key, value: storageValue };
    if (storageMode === "seed") {
      setStorageSeeds((current) => [...current, entry]);
    } else {
      setStorageAssertions((current) => [...current, entry]);
    }
    setStorageKey("");
    setStorageValue("");
  }

  function removeStorageEntry(mode: "seed" | "assert", index: number) {
    const setter = mode === "seed" ? setStorageSeeds : setStorageAssertions;
    setter((current) => current.filter((_, position) => position !== index));
  }

  /** Assertions are part of the edit state: adding or removing one enters edit mode (Save applies it). */
  function addAssertion(type: AssertionType, value: string) {
    setAssertions((current) => [...current, { id: newAssertionId(), type, value }]);
    setEditing(true);
  }

  function removeAssertion(id: string) {
    setAssertions((current) => current.filter((item) => item.id !== id));
    setEditing(true);
  }

  async function handleDelete() {
    if (!projectId || !testCaseId || !testCase) return;
    const deleted = await confirm({
      title: "Delete test case?",
      description: (
        <>
          <strong>{testCase.name}</strong> and its run history will be permanently deleted.
        </>
      ),
      confirmLabel: "Delete test case",
      tone: "danger",
      onConfirm: async () => {
        await api.deleteTestCase(projectId, testCaseId);
      },
    });
    if (!deleted) return;
    toast.success("Test case deleted");
    // The page no longer exists; return to the list it belongs to.
    navigate(`/projects/${projectId}/test-cases`, { replace: true });
  }

  function copyId() {
    if (!testCase) return;
    void navigator.clipboard
      .writeText(testCase.id)
      .then(() => toast.success("Test case ID copied", { description: testCase.id }))
      .catch(() => toast.error("Could not copy the ID"));
  }

  async function viewVersion(versionNumber: number) {
    if (!projectId || !testCaseId) return;
    try {
      const detail = await api.testCaseVersion(projectId, testCaseId, versionNumber);
      setSelectedVersion(detail);
    } catch (err) {
      reportError(errorMessage(err, "Could not load version"));
    }
  }

  // `?record=1` (older create links): start recording once, then drop the param so a refresh doesn't repeat it.
  const autoRecordStarted = useRef(false);
  const wantsRecord = searchParams?.get("record") === "1";
  useEffect(() => {
    if (!wantsRecord || !testCase || autoRecordStarted.current) return;
    autoRecordStarted.current = true;
    setQuery({ record: null });
    void handleRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount when the test case is loaded
  }, [wantsRecord, testCase]);

  const upcomingJobIds = new Set(scheduled.map((item) => item.jobId));
  const scheduledResults = caseRuns.filter(
    (run) =>
      Boolean(run.scheduledFor) &&
      Boolean(run.jobId) &&
      !upcomingJobIds.has(run.jobId || "") &&
      (run.status === "Passed" || run.status === "Failed" || run.status === "Running")
  );
  const latestFinished = caseRuns.find((run) => run.status === "Passed" || run.status === "Failed");
  const environmentName = environments.find((env) => env.id === environmentId)?.name ?? null;
  const backTo = `/projects/${projectId}/test-cases`;

  if (loading) return <DetailSkeleton />;

  if (error && !testCase) {
    return (
      <PageContainer width="detail">
        <Alert
          variant="error"
          title="Could not load this test case"
          action={
            <Button asChild variant="secondary" size="sm">
              <Link to={backTo}>Back to test cases</Link>
            </Button>
          }
        >
          {error}
        </Alert>
      </PageContainer>
    );
  }

  if (!testCase) {
    return (
      <PageContainer width="detail">
        <EmptyState
          variant="panel"
          icon={FileQuestion}
          title="Test case not found"
          description="It may have been deleted or moved to another project."
          action={
            <Button asChild variant="secondary">
              <Link to={backTo}>Back to test cases</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const busy = saving || recording || running;
  const runnableEnvironments = environments.filter((env) =>
    applicableEnvironmentIds.length ? applicableEnvironmentIds.includes(env.id) : true
  );
  const hasLiveRun = caseRuns.some((run) => isLive(run.status));
  const runRows: RunRow[] =
    running && !hasLiveRun
      ? [
          {
            id: "live",
            live: true,
            status: runPhase.startsWith("Running") ? "Running" : "Queued",
            phase: runPhase || "Preparing test...",
            startedAt: new Date().toISOString(),
          },
          ...caseRuns,
        ]
      : caseRuns;
  const placeholderName = isNew && testCase.name === DRAFT_TEST_NAME;

  const storageEditor = (
    <StoragePanel
      mode={storageMode}
      onModeChange={setStorageMode}
      kind={storageKind}
      onKindChange={setStorageKind}
      entryKey={storageKey}
      onEntryKeyChange={setStorageKey}
      entryValue={storageValue}
      onEntryValueChange={setStorageValue}
      onAdd={addStorageEntry}
      validationError={storageError}
      seeds={storageSeeds}
      assertions={storageAssertions}
      onRemove={removeStorageEntry}
    />
  );

  const title = editing ? (
    <input
      ref={titleRef}
      value={nameDraft}
      onChange={(event) => setNameDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void saveEdits();
        }
      }}
      aria-label="Test case name"
      placeholder={placeholderName ? "Name this test" : "Test case name"}
      className="-mx-1.5 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-2xl leading-8 font-semibold tracking-[-0.015em] text-foreground outline-none placeholder:text-faint hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    />
  ) : (
    testCase.name
  );

  const description = editing ? (
    <input
      value={descriptionDraft}
      onChange={(event) => setDescriptionDraft(event.target.value)}
      aria-label="Description"
      placeholder="Add a one-line description (optional)"
      className="-mx-1.5 mt-0.5 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] text-muted-foreground outline-none placeholder:text-faint hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    />
  ) : (
    testCase.description || undefined
  );

  return (
    <PageContainer width="detail" className={cn(editing && "pb-24")}>
      <PageHeader
        title={title}
        description={description}
        meta={
          <>
            <span className="inline-flex items-center gap-0.5">
              <Badge variant="outline" className="font-mono">
                {testCase.code}
              </Badge>
              <Button variant="ghost" size="icon-sm" className="size-6" onClick={copyId} aria-label="Copy test case ID" title="Copy test case ID">
                <Copy className="size-3.5" />
              </Button>
            </span>
            <Badge variant={testCase.isDraft ? "warning" : "default"}>{testCaseStatusLabel(testCase)}</Badge>
            <RunSummaryStrip runs={caseRuns} />
          </>
        }
        actions={
          <>
            <RunSplitButton
              onRun={(envId) => void handleRun(envId)}
              running={running}
              disabled={!hasScript || recording || running}
              environments={runnableEnvironments}
              environmentId={environmentId}
              onEnvironmentChange={setEnvironmentId}
            />
            {!editing ? (
              <Button variant="outline" onClick={startEditing}>
                <Pencil />
                Edit
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={openSchedule} disabled={!hasScript}>
                  <CalendarClock />
                  Schedule a run
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete()}>
                  <Trash2 />
                  Delete test case
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)} className="min-w-0 gap-4">
          <TabsList variant="line" className="h-auto w-full justify-start gap-1 rounded-none border-b border-border p-0">
            {(
              [
                ["steps", "Steps"],
                ["runs", "Runs"],
                ["history", "History"],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="h-9 flex-none rounded-none px-3 text-[13px] after:bottom-[-1px]">
                {label}
                {value === "runs" && caseRuns.length > 0 ? (
                  <span className="rounded-sm bg-elevated px-1.5 text-xs text-muted-foreground tabular-nums">{caseRuns.length}</span>
                ) : null}
                {value === "runs" && (running || hasLiveRun) ? (
                  <span aria-label="Run in progress" className="size-1.5 rounded-full bg-brand-accent motion-safe:animate-pulse" />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="steps">
            <StepsTab
              testCase={testCase}
              script={scriptSource}
              scriptPath={scriptPath || testCase.testFile || ""}
              startUrl={resolvedPreview || testCase.resolvedStartUrl || ""}
              authProfile={selectedAuthProfile}
              storageSeeds={storageSeeds}
              storageAssertions={storageAssertions}
              assertions={assertions}
              onAddAssertion={addAssertion}
              onRemoveAssertion={removeAssertion}
              expectedResult={expectedResult}
              onExpectedResultChange={setExpectedResult}
              editing={editing}
              recording={recording}
              canRecord={!recording && !running}
              onRecord={() => void handleRecord()}
              onEditCode={() => void openScriptEditor()}
              scriptMissing={scriptMissing}
              storageEditor={storageEditor}
            />
          </TabsContent>

          <TabsContent value="runs">
            <div className="space-y-4">
              {caseRuns.length >= 2 ? <RunsChart runs={caseRuns} loading={!historyLoaded} /> : null}
              <RunsTab
                projectId={projectId}
                runs={runRows}
                loading={!historyLoaded}
                onRun={() => void handleRun()}
                canRun={hasScript && !recording && !running}
                header={
                  <ResultPanel
                    running={running}
                    runPhase={runPhase}
                    lastResult={lastResult}
                    latestFinished={latestFinished}
                    testName={`${testCase.code} ${testCase.name}`}
                    timeZone={scheduleZone}
                    environmentName={environmentName}
                  />
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              <SectionHeader
                title="Versions"
                description={testCase.isDraft ? "This test has unpublished changes." : "The published version is what scheduled and suite runs use."}
                actions={
                  <Button size="sm" variant="outline" onClick={() => void handlePublish()} loading={publishing} disabled={saving || recording}>
                    {!publishing ? <Upload /> : null}
                    Publish version
                  </Button>
                }
              />
              <VersionHistoryPanel versions={versions} selected={selectedVersion} onSelect={viewVersion} />
            </div>
          </TabsContent>
        </Tabs>

        <aside className="min-w-0 space-y-4 xl:pt-[52px]">
          <DetailsPanel
            projectId={projectId}
            editing={editing}
            scenario={scenario}
            onScenarioChange={setScenario}
            category={category}
            onCategoryChange={setCategory}
            executionCategories={executionCategories}
            onExecutionCategoriesChange={setExecutionCategories}
            suites={suites}
            suiteId={suiteIdDraft}
            onSuiteChange={setSuiteIdDraft}
            environments={environments}
            environmentIds={applicableEnvironmentIds}
            onEnvironmentIdsChange={changeApplicableEnvironments}
            authProfiles={authProfiles}
            authProfileId={authProfileId}
            onAuthProfileChange={setAuthProfileId}
            startPath={startPath}
            onStartPathChange={setStartPath}
            resolvedStartUrl={resolvedPreview || testCase.resolvedStartUrl || ""}
            automationStatus={testCase.automationStatus}
          />
          <div ref={scheduleRef} className="scroll-mt-6">
            <details
              open={scheduleOpen}
              onToggle={(event) => setScheduleOpen((event.target as HTMLDetailsElement).open)}
              className="group rounded-lg border border-border bg-surface open:border-0 open:bg-transparent"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-foreground hover:bg-state-hover group-open:sr-only [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                  Schedule a run
                  {scheduled.length > 0 ? (
                    <span className="rounded-sm bg-elevated px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{scheduled.length}</span>
                  ) : null}
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
              </summary>
              {scheduleOpen ? (
                <SchedulePanel
                  date={scheduleDate}
                  time={scheduleTime}
                  zone={scheduleZone}
                  detectedZone={detectedZone}
                  zoneOverridden={zoneOverridden}
                  timeZones={timeZones}
                  onDateChange={setScheduleDate}
                  onTimeChange={setScheduleTime}
                  onZoneChange={(zone) => {
                    setZoneOverridden(true);
                    setScheduleZone(zone);
                  }}
                  onSchedule={handleSchedule}
                  canSchedule={hasScript && !running}
                  scheduling={scheduling}
                  validationError={scheduleError}
                  scheduled={scheduled}
                  scheduledResults={scheduledResults}
                  onCancel={cancelSchedule}
                />
              ) : null}
            </details>
          </div>
        </aside>
      </div>

      {editing ? (
        <div
          role="region"
          aria-label="Edit actions"
          className="sticky bottom-0 z-30 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6"
        >
          <p className="text-[13px] text-muted-foreground">
            {isNew ? "New draft. Name it, record the steps, then save." : dirty ? "You have unsaved changes." : "Editing. Changes apply when you save."}
          </p>
          <div className="flex items-center gap-2">
            {isNew ? (
              <Button variant="ghost" onClick={() => void discardDraft()} disabled={saving}>
                Discard draft
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => void cancelEdits()} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button onClick={() => void saveEdits()} loading={saving} disabled={busy && !saving}>
              {!saving ? <Save /> : null}
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {scriptOpen ? (
        <ScriptEditorModal
          open={scriptOpen}
          onClose={() => setScriptOpen(false)}
          scriptPath={scriptPath}
          content={scriptContent}
          onContentChange={setScriptContent}
          loading={scriptLoading}
          saving={scriptSaving}
          onSave={handleSaveScript}
        />
      ) : null}

    </PageContainer>
  );
}

export default TestCaseDetailPage;
