"use client";

import type { ReactNode } from "react";
import { Link } from "@/lib/navigation";
import {
  TEST_CASE_CATEGORIES,
  TEST_CASE_SCENARIOS,
  type AuthProfileSummary,
  type EnvironmentSummary,
  type TestCaseCategory,
  type TestCaseScenario,
  type TestSuiteSummary,
} from "@/lib/api";
import type { SuiteCategory } from "@/lib/suiteCategory";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CategoryMultiSelect, EnvironmentMultiSelect } from "@/components/suites/CategoryMultiSelect";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";
import { authProfileLabel } from "@/components/test-cases/testCaseFormat";

const SCENARIO_LABELS: Record<TestCaseScenario, string> = { "Happy Path": "Happy path", Negative: "Negative", "Edge Case": "Edge case" };

export type DetailsPanelProps = {
  projectId: string;
  editing: boolean;
  scenario: TestCaseScenario;
  onScenarioChange: (value: TestCaseScenario) => void;
  category: TestCaseCategory;
  onCategoryChange: (value: TestCaseCategory) => void;
  executionCategories: SuiteCategory[];
  onExecutionCategoriesChange: (value: SuiteCategory[]) => void;
  suites: TestSuiteSummary[];
  suiteId: string;
  onSuiteChange: (id: string) => void;
  environments: EnvironmentSummary[];
  environmentIds: string[];
  onEnvironmentIdsChange: (ids: string[]) => void;
  authProfiles: AuthProfileSummary[];
  authProfileId: string;
  onAuthProfileChange: (id: string) => void;
  startPath: string;
  onStartPathChange: (value: string) => void;
  resolvedStartUrl: string;
  automationStatus: string;
};

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words text-foreground", mono && "font-mono text-xs leading-5")}>{children}</dd>
    </div>
  );
}

/** The single home for a test case's metadata; fields become editable in place in edit mode. */
export function DetailsPanel(props: DetailsPanelProps) {
  const {
    projectId,
    editing,
    scenario,
    onScenarioChange,
    category,
    onCategoryChange,
    executionCategories,
    onExecutionCategoriesChange,
    suites,
    suiteId,
    onSuiteChange,
    environments,
    environmentIds,
    onEnvironmentIdsChange,
    authProfiles,
    authProfileId,
    onAuthProfileChange,
    startPath,
    onStartPathChange,
    resolvedStartUrl,
    automationStatus,
  } = props;
  const suite = suites.find((item) => item.id === suiteId);
  const authProfile = authProfiles.find((profile) => profile.id === authProfileId);
  const environmentNames = environments.filter((env) => environmentIds.includes(env.id)).map((env) => env.name);
  const renewalWarning = authProfile?.needsRenewal ? (
    <p className="mt-1.5 text-xs text-warning">
      This login session is expired or expiring. Renew it on{" "}
      <Link to={`/projects/${projectId}/auth-profiles`} className="font-medium underline underline-offset-2">
        Auth profiles
      </Link>{" "}
      before recording or running.
    </p>
  ) : null;

  return (
    <Card className={cn("min-w-0 self-start", editing && "border-primary/40")}>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      {editing ? (
        <CardContent className="space-y-4">
          <SegmentedControl
            label="Scenario"
            size="sm"
            fullWidth
            value={scenario}
            onChange={onScenarioChange}
            options={TEST_CASE_SCENARIOS.map((value) => ({ value, label: SCENARIO_LABELS[value] }))}
          />
          <SegmentedControl
            label="Capability"
            size="sm"
            fullWidth
            value={category}
            onChange={onCategoryChange}
            options={TEST_CASE_CATEGORIES.map((value) => ({ value, label: value }))}
          />
          <CategoryMultiSelect legend="Categories" value={executionCategories} onChange={onExecutionCategoriesChange} />
          <Select
            label="Suite"
            value={suiteId}
            onChange={onSuiteChange}
            options={[{ value: "", label: "No suite" }, ...suites.map((item) => ({ value: item.id, label: item.name }))]}
          />
          <EnvironmentMultiSelect environments={environments} value={environmentIds} onChange={onEnvironmentIdsChange} />
          <div>
            <Select
              label="Auth profile"
              value={authProfileId}
              onChange={onAuthProfileChange}
              options={[{ value: "", label: "None" }, ...authProfiles.map((profile) => ({ value: profile.id, label: authProfileLabel(profile) }))]}
            />
            {renewalWarning}
          </div>
          <div>
            <Input
              label="Start URL"
              className="font-mono"
              value={startPath}
              onChange={(event) => onStartPathChange(event.target.value)}
              placeholder="/ or https://example.com"
            />
            <p className="mt-1.5 flex min-w-0 items-baseline gap-2 text-xs">
              <span className="shrink-0 text-muted-foreground">Opens</span>
              <span className="min-w-0 truncate font-mono text-foreground" title={resolvedStartUrl || undefined}>
                {resolvedStartUrl || "—"}
              </span>
            </p>
          </div>
        </CardContent>
      ) : (
        <CardContent className="py-1.5">
          <dl className="divide-y divide-border-subtle">
            <Row label="Scenario">{SCENARIO_LABELS[scenario] ?? scenario}</Row>
            <Row label="Capability">{category}</Row>
            <Row label="Categories">
              {executionCategories.length ? <SuiteCategoryBadges categories={executionCategories} /> : <span className="text-muted-foreground">None</span>}
            </Row>
            <Row label="Suite">
              {suite ? (
                <Link to={`/projects/${projectId}/suites/${suite.id}`} className="text-brand-accent hover:text-foreground hover:underline">
                  {suite.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">No suite</span>
              )}
            </Row>
            <Row label="Environments">{environmentNames.length ? environmentNames.join(", ") : <span className="text-muted-foreground">Default</span>}</Row>
            <Row label="Auth profile">
              {authProfile ? authProfileLabel(authProfile) : <span className="text-muted-foreground">None</span>}
              {renewalWarning}
            </Row>
            <Row label="Start URL" mono>
              {resolvedStartUrl || startPath || "/"}
            </Row>
            <Row label="Automation">{automationStatus}</Row>
          </dl>
        </CardContent>
      )}
    </Card>
  );
}
