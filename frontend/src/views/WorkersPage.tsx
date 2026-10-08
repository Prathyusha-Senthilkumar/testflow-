"use client";

import { useWorkers } from "@/hooks/useWorkers";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { LiveIndicator } from "@/components/workers/live-indicator";
import { WorkersOverview } from "@/components/workers/workers-overview";

/** Workers: test runners and their execution slots, polled every 5s while visible. */
export function WorkersPage() {
  const { data, loading, unavailable, error, updatedAt, paused, projectNames } = useWorkers({ intervalMs: 5000 });

  return (
    <PageContainer>
      <PageHeader
        title="Runners"
        description="Test runners and their parallel run slots. Updates every 5 seconds."
        actions={unavailable && !data ? null : <LiveIndicator updatedAt={updatedAt} paused={paused} />}
      />
      <WorkersOverview data={data} loading={loading} unavailable={unavailable} error={error} projectNames={projectNames} />
    </PageContainer>
  );
}

export default WorkersPage;
