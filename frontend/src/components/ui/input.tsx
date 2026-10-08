import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared control styling, reused by Select, Textarea and custom fields. */
export const controlClasses =
  "h-9 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-sm text-foreground transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-faint hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25";

export type InputProps = React.ComponentProps<"input"> & {
  label?: string;
  error?: string;
  /** Helper text shown under the field when there is no error. */
  hint?: string;
};

export function FieldLabel({
  htmlFor,
  required,
  children,
  className,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      data-slot="field-label"
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-[13px] font-medium text-foreground", className)}
    >
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </label>
  );
}

export function FieldMessage({ id, error, hint }: { id?: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={id} data-slot="field-error" className="mt-1.5 text-xs text-destructive">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} data-slot="field-hint" className="mt-1.5 text-xs text-muted-foreground">
        {hint}
      </p>
    );
  }
  return null;
}

export function Input({ className, label, error, hint, required, id, ...props }: InputProps) {
  const generatedId = React.useId();
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : generatedId);
  const messageId = error || hint ? `${inputId}-message` : undefined;

  const field = (
    <input
      id={inputId}
      data-slot="input"
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
      className={cn(
        controlClasses,
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  );

  return (
    <div className="w-full">
      {label ? (
        <FieldLabel htmlFor={inputId} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      {field}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
