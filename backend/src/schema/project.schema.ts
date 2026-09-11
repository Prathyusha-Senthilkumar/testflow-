/** Database/view shapes returned by Supabase. These stay separate from API DTOs and domain entities. */
export interface ProjectOverviewRow {
  id: string;
  name: string;
  base_url: string;
  description: string | null;
  created_at?: string;
  suites?: number | string | null;
  cases?: number | string | null;
  passed?: number | string | null;
  failed?: number | string | null;
  pass_rate?: number | string | null;
  last_run?: string | null;
  last_run_by?: string | null;
}

export interface SuiteOverviewRow {
  id: string;
  project_id: string;
  name: string;
  cases?: number | string | null;
  passed?: number | string | null;
  failed?: number | string | null;
  not_run?: number | string | null;
  pass_rate?: number | string | null;
  last_run?: string | null;
  last_run_by?: string | null;
}
