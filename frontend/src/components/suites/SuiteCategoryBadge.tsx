import { suiteCategoryLabel } from "@/lib/suiteCategory";
import { Badge } from "@/components/ui/badge";

export function SuiteCategoryBadge({ category }: { category?: string | null }) {
  return <Badge variant="outline">{suiteCategoryLabel(category)}</Badge>;
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
