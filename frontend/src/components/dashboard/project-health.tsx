"use client";

import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { relativeTime, type ProjectHealth } from "@/lib/dashboard";
import type { ProjectSummary } from "@/lib/api";
import { Card, CardArrow } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Meter, OutcomeTicks } from "@/components/dashboard/panel";
import { LoadingArea } from "@/components/common/LoadingArea";

type ProjectHealthListProps = {
  active: ProjectHealth[];
  idle: ProjectSummary[];
  now: number;
  loading?: boolean;
  limit?: number;
};

/** Compact interactive cards for projects with runs; idle projects collapse into one line. */
export function ProjectHealthList({ active, idle, now, loading = false, limit = 6 }: ProjectHealthListProps) {
  if (loading) {
    return (
      <LoadingArea
        loading
        label="Loading projects…"
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[86px] w-full rounded-lg" />
            ))}
          </div>
        }
      />
    );
  }
  return (
    <div className="space-y-2">
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">No project has runs yet.</p>
      ) : (
        active.slice(0, limit).map((project) => {
          const rate = project.passRate;
          return (
            <Card key={project.id} interactive asChild className="block p-3">
              <Link to={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
                <CardArrow />
                <div className="flex items-baseline justify-between gap-3 pr-6">
                  <span data-card-title className="truncate text-[13px] font-semibold text-foreground">
                    {project.name}
                  </span>
                  <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", rate == null ? "text-muted-foreground" : "text-foreground")}>
                    {rate == null ? "—" : `${Math.round(rate)}%`}
                  </span>
                </div>
                <Meter
                  value={rate ?? 0}
                  tone={rate == null ? "muted" : "success"}
                  failShare={rate == null ? 0 : 100 - rate}
                  label={`${project.name} pass rate`}
                  className="mt-2"
                />
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <OutcomeTicks outcomes={project.recent} />
                  <span className="truncate tabular-nums">
                    {project.failingTests > 0 ? <span className="text-destructive">{project.failingTests} failing · </span> : null}
                    Last run {relativeTime(project.lastRunAt, now)}
                  </span>
                </div>
              </Link>
            </Card>
          );
        })
      )}
      {idle.length > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {idle.length} {idle.length === 1 ? "project has" : "projects have"} no runs yet ·{" "}
          <Link to="/projects" className="text-brand-accent hover:underline">
            View
          </Link>
        </p>
      ) : null}
    </div>
  );
}
