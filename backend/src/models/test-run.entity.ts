export type TestRunStatus = 'Passed' | 'Failed' | 'Not Run';

export interface TestRunEntity {
  id: string;
  testCaseId: string;
  status: TestRunStatus;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
}
