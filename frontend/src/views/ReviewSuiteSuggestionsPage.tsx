"use client";

import { useState } from "react";
import { Check, Plus, PlusCircle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useNavigate, useParams } from "@/lib/navigation";
import { suggestedSuites, testCases } from "@/lib/demoData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { CreateSuiteModal } from "@/components/suites/CreateSuiteModal";

/** Demo-data review screen for clustered suite suggestions (no API yet). */
export function ReviewSuiteSuggestionsPage() {
  const { id = "demo-project" } = useParams();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState<string[]>(suggestedSuites.map((s) => s.id));
  const [open, setOpen] = useState(false);

  return (
    <PageContainer className="pb-0">
      <PageHeader
        title="Review suite suggestions"
        description="Review and organize the suggested test suite groupings before adding them to your project."
        meta={<Badge variant="outline" className="font-mono">AI clustering</Badge>}
        actions={
          <>
            <Button variant="outline">
              <SlidersHorizontal />
              Detection rules
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus />
              Create suite manually
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-info-soft text-info">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div>
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              3 suggested suites detected
              <Badge variant="outline" className="font-mono">Cluster Engine v2.4</Badge>
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Based on recent admissions & auth coverage. Suggestions are temporary until confirmed below.
            </p>
          </div>
        </div>
        <dl className="flex gap-4 text-[13px]">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">Total assignments</dt>
            <dd className="font-semibold tabular-nums">6</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">Multi-suite links</dt>
            <dd className="font-semibold tabular-nums">1</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        {suggestedSuites.map((s) => {
          const isAccepted = accepted.includes(s.id);
          return (
            <Card key={s.id} className={cn("overflow-hidden transition-colors duration-150", isAccepted && "border-primary/40")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
                <h2 className="text-[15px] font-semibold">{s.name}</h2>
                <Badge variant="info">Suggested</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">{s.cases.length} test cases</span>
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAccepted((v) => v.filter((x) => x !== s.id))}>
                    <X />
                    Reject
                  </Button>
                  <Button
                    variant={isAccepted ? "default" : "outline"}
                    size="sm"
                    aria-pressed={isAccepted}
                    onClick={() => setAccepted((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))}
                  >
                    <Check />
                    {isAccepted ? "Accepted" : "Accept"}
                  </Button>
                </div>
                <p className="w-full text-[13px] text-muted-foreground">{s.description}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="h-9 px-4 text-left font-medium">ID</th>
                      <th className="h-9 px-4 text-left font-medium">Test case</th>
                      <th className="h-9 px-4 text-left font-medium">Status</th>
                      <th className="h-9 px-4 text-left font-medium">Automation</th>
                      <th className="h-9 px-4 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.cases.map((cid) => {
                      const t = testCases.find((x) => x.id === cid) ?? testCases[0];
                      return (
                        <tr key={cid} className="border-b border-border-subtle last:border-0 hover:bg-elevated/60">
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{cid}</td>
                          <td className="px-4 py-2 font-medium">{t.name}</td>
                          <td className="px-4 py-2">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{t.automation}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {/* Demo page: moving cases between suggestions is not implemented (same as before). */}
                              <Select
                                aria-label={`Move ${cid} to suite`}
                                size="sm"
                                className="w-40"
                                triggerClassName="h-7 text-xs"
                                placeholder="Move to suite"
                                value=""
                                options={suggestedSuites.filter((other) => other.id !== s.id).map((other) => ({ value: other.id, label: other.name }))}
                              />
                              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${cid} from suggestion`}>
                                <X />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-2">
                <Button variant="link" size="sm">
                  <PlusCircle />
                  Add test case to this suite
                </Button>
                <span className="text-xs text-faint">Test cases can belong to multiple suites.</span>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="flex items-center gap-2 text-[13px]">
          <span aria-hidden className="size-2 rounded-full bg-primary" />
          <span>
            <b className="font-semibold">3 suggested suites</b>{" "}
            <span className="text-muted-foreground">(6 test case assignments) reviewed</span>
          </span>
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/projects/${id}/suites`)}>
            Cancel
          </Button>
          <Button onClick={() => navigate(`/projects/${id}/suites`)}>
            <Check />
            Confirm suites <span className="tabular-nums">({accepted.length})</span>
          </Button>
        </div>
      </div>

      <CreateSuiteModal open={open} onClose={() => setOpen(false)} onSubmit={() => setOpen(false)} />
    </PageContainer>
  );
}

export default ReviewSuiteSuggestionsPage;
