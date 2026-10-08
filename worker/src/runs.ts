import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// test_runs status writes. Every write is conditional on the current status, so a terminal
// state (Passed, Failed, Not Run/Cancelled) is never overwritten by a late or duplicate update.
const ACTIVE = ["Queued", "Running"];

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = process.env.USE_DEMO_DATA !== "true" && url && key ? createClient(url, key) : null;
  return client;
}

async function update(
  jobId: string,
  fields: Record<string, unknown>,
  fromStatuses: string[],
  db: SupabaseClient | null = supabase()
): Promise<boolean> {
  if (!db) return false;
  const { data, error } = await db
    .from("test_runs")
    .update(fields)
    .eq("job_id", jobId)
    .in("status", fromStatuses)
    .select("id");
  if (error) {
    console.error(`event=run_update_failed job_id=${jobId} code=${error.code || "unknown"}`);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export function markRunning(jobId: string, db?: SupabaseClient | null): Promise<boolean> {
  return update(jobId, { status: "Running", started_at: new Date().toISOString() }, ["Queued"], db);
}

export function markFinished(
  jobId: string,
  status: "Passed" | "Failed",
  fields: { duration_ms?: number | null; error_message: string | null; screenshot_path?: string | null },
  db?: SupabaseClient | null
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    status,
    error_message: fields.error_message,
    completed_at: new Date().toISOString(),
  };
  if (fields.duration_ms !== undefined) payload.duration_ms = fields.duration_ms;
  if (fields.screenshot_path) payload.screenshot_path = fields.screenshot_path;
  return update(jobId, payload, ACTIVE, db);
}

export function markCancelled(jobId: string, db?: SupabaseClient | null): Promise<boolean> {
  return update(jobId, { status: "Not Run", error_message: "Cancelled", completed_at: new Date().toISOString() }, ACTIVE, db);
}

/** Running -> Queued when a job is handed back (shutdown or crash recovery). */
export function markRequeued(jobId: string, db?: SupabaseClient | null): Promise<boolean> {
  return update(jobId, { status: "Queued" }, ["Running"], db);
}
