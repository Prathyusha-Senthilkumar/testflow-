import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";

type Props = {
  value: SuiteCategory[];
  onChange: (value: SuiteCategory[]) => void;
  legend?: string;
};

export function CategoryMultiSelect({ value, onChange, legend = "Categories" }: Props) {
  function toggle(item: SuiteCategory) {
    onChange(value.includes(item) ? value.filter((current) => current !== item) : [...value, item]);
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {SUITE_CATEGORIES.map((item) => (
          <label key={item} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm">
            <input type="checkbox" checked={value.includes(item)} onChange={() => toggle(item)} />
            {SUITE_CATEGORY_LABELS[item]}
          </label>
        ))}
      </div>
    </fieldset>
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
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((current) => current !== id) : [...value, id]);
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Applicable environments</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {environments.length === 0 ? (
          <span className="text-sm text-slate-500">No environments are configured for this project.</span>
        ) : (
          environments.map((environment) => (
            <label key={environment.id} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm">
              <input type="checkbox" checked={value.includes(environment.id)} onChange={() => toggle(environment.id)} />
              {environment.name}
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}
