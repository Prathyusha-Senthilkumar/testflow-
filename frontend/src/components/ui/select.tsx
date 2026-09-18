import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  className?: string;
  id?: string;
  placeholder?: string;
};

export function Select({
  label,
  options,
  value,
  onChange,
  disabled,
  required,
  error,
  className,
  id,
  placeholder,
}: SelectProps) {
  const selectId = id ?? (label ? `select-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-slate-900">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </label>
      ) : null}
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn(
          "h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none transition",
          error
            ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            : "border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
          disabled && "cursor-not-allowed bg-slate-50 text-slate-500"
        )}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
