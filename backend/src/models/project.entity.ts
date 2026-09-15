export interface ProjectSummary {
  id: string;
  name: string;
  baseUrl: string;
  description?: string | null;
  suites: number;
  cases: number;
  passed: number;
  failed: number;
  passRate: number;
  lastRun: string | null;
  lastRunBy: string | null;
}

export interface SuiteSummary {
  id: string;
  name: string;
  cases: number;
  passed: number;
  failed: number;
  notRun: number;
  passRate: number;
  lastRun: string | null;
  lastRunBy: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  description: string | null;
  suitesList: SuiteSummary[];
}
