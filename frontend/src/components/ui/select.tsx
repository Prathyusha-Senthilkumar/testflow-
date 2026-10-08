"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel, FieldMessage, controlClasses } from "@/components/ui/input";
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-menu";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  /** Classes for the wrapper (width, margins). */
  className?: string;
  /** Classes for the trigger button. */
  triggerClassName?: string;
  id?: string;
  placeholder?: string;
  /** Form field name (Radix renders a hidden native select for form submission). */
  name?: string;
  size?: "default" | "sm";
  "aria-label"?: string;
};

/** Radix Select can't use "" as an item value, so "" options map to this sentinel internally. */
const EMPTY_SENTINEL = "__attest_empty__";

const toRadix = (value: string) => (value === "" ? EMPTY_SENTINEL : value);
const fromRadix = (value: string) => (value === EMPTY_SENTINEL ? "" : value);

/**
 * Single-choice picker with the legacy `options` / `onChange(value)` API,
 * rendered as a Radix Select (keyboard navigation, typeahead, check on the
 * selected item, scrollable popover).
 */
export function Select({
  label,
  options,
  value,
  onChange,
  disabled,
  required,
  error,
  className,
  triggerClassName,
  id,
  placeholder,
  name,
  size = "default",
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = React.useId();
  const selectId = id ?? (label ? `select-${label.replace(/\s+/g, "-").toLowerCase()}` : generatedId);
  const messageId = error ? `${selectId}-message` : undefined;
  const current = value ?? "";
  const hasEmptyOption = options.some((option) => option.value === "");
  // "" with no matching option means "nothing selected": show the placeholder.
  const radixValue = current === "" && !hasEmptyOption ? "" : toRadix(current);

  return (
    <div className={cn("w-full min-w-0", className)}>
      {label ? (
        <FieldLabel htmlFor={selectId} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      <SelectRoot
        value={radixValue}
        onValueChange={(next) => onChange?.(fromRadix(next))}
        disabled={disabled}
        required={required}
        name={name}
      >
        <SelectTrigger
          id={selectId}
          size={size}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={cn("w-full", triggerClassName)}
        >
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72 min-w-(--radix-select-trigger-width)">
          {options.map((option) => (
            <SelectItem key={option.value || EMPTY_SENTINEL} value={toRadix(option.value)} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
      <FieldMessage id={messageId} error={error} />
    </div>
  );
}

/**
 * Class string for a native `<select>` styled like the other controls. Only for
 * cases that truly need native behaviour; prefer `Select`.
 */
export const nativeSelectClasses = cn(controlClasses, "pr-8");
