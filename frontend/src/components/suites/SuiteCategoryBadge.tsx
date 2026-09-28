import { suiteCategoryLabel } from "@/lib/suiteCategory";

export function SuiteCategoryBadge({ category }: { category?: string | null }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {suiteCategoryLabel(category)}
    </span>
  );
}

export function SuiteCategoryBadges({
  categories,
  category,
}: {
  categories?: string[] | null;
  category?: string | null;
}) {
  const values = categories?.length ? categories : category ? [category] : [];
  if (values.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {values.map((value) => (
        <SuiteCategoryBadge key={value} category={value} />
      ))}
    </span>
  );
}
