export const SUITE_CATEGORIES = ["smoke", "sanity", "regression", "full_regression"] as const;

export type SuiteCategory = (typeof SUITE_CATEGORIES)[number];

export const SUITE_CATEGORY_LABELS: Record<SuiteCategory, string> = {
  smoke: "Smoke",
  sanity: "Sanity",
  regression: "Regression",
  full_regression: "Full Regression",
};

export function suiteCategoryLabel(value?: string | null): string {
  if (value && value in SUITE_CATEGORY_LABELS) return SUITE_CATEGORY_LABELS[value as SuiteCategory];
  return "Regression";
}
