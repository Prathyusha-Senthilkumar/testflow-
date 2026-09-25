import { suiteCategoryLabel } from "@/lib/suiteCategory";

export function SuiteCategoryBadge({ category }: { category?: string | null }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {suiteCategoryLabel(category)}
    </span>
  );
}
