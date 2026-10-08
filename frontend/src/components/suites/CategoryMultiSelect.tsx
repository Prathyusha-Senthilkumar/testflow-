"use client";

import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";
import { MultiSelect } from "@/components/ui/multi-select";

type Props = {
  value: SuiteCategory[];
  onChange: (value: SuiteCategory[]) => void;
  legend?: string;
};

const CATEGORY_OPTIONS = SUITE_CATEGORIES.map((item) => ({ value: item, label: SUITE_CATEGORY_LABELS[item] }));

/** Suite category picker (Popover + checklist with chips). */
export function CategoryMultiSelect({ value, onChange, legend = "Categories" }: Props) {
  return (
    <MultiSelect
      label={legend}
      options={CATEGORY_OPTIONS}
      value={value}
      onChange={(next) => onChange(next as SuiteCategory[])}
      placeholder="Choose categories"
    />
  );
}

export function EnvironmentMultiSelect({
  environments,
  value,
  onChange,
}: {
  environments: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <MultiSelect
      label="Applicable environments"
      options={environments.map((environment) => ({ value: environment.id, label: environment.name }))}
      value={value}
      onChange={onChange}
      placeholder={environments.length === 0 ? "No environments configured" : "Choose environments"}
      emptyText="No environments are configured for this project."
      disabled={environments.length === 0}
    />
  );
}
