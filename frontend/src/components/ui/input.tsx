import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ className, label, error, required, id, ...props }: InputProps) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  const field = (
    <input
      id={inputId}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(
        "h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none transition",
        error
          ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
          : "border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        props.disabled && "cursor-not-allowed bg-slate-50 text-slate-500",
        className
      )}
      {...props}
    />
  );

  if (!label) {
    return (
      <div className="w-full">
        {field}
        {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-900">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {field}
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
