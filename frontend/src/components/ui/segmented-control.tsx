"use client";

import * as React from "react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";
import { FieldLabel, FieldMessage } from "@/components/ui/input";

export type SegmentedOption<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  /** Optional leading visual (icon or coloured dot). */
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Accessible label when `label` isn't plain text. */
  "aria-label"?: string;
};

type BaseProps<T extends string> = {
  options: SegmentedOption<T>[];
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Stretch segments to fill the width. */
  fullWidth?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

type SingleProps<T extends string> = BaseProps<T> & {
  multiple?: false;
  value: T;
  onChange: (value: T) => void;
};

type MultipleProps<T extends string> = BaseProps<T> & {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
};

export type SegmentedControlProps<T extends string = string> = SingleProps<T> | MultipleProps<T>;

const rootClasses = "inline-flex max-w-full items-center gap-0.5 rounded-md border border-border bg-elevated p-0.5";
const itemClasses =
  "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-state-hover data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-[0_0_0_1px_var(--color-border),0_1px_2px_rgb(0_0_0/0.06)] dark:data-[state=on]:bg-state-active dark:data-[state=on]:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_45%,transparent)] [&_svg]:size-3.5 [&_svg]:shrink-0";

/**
 * Segmented control for small enums (radix ToggleGroup). Single mode is a
 * radiogroup (arrow keys move and select); `multiple` is a multi-toggle.
 */
export function SegmentedControl<T extends string = string>(props: SegmentedControlProps<T>) {
  const { options, label, required, error, hint, size = "md", disabled, fullWidth, className, id, "aria-label": ariaLabel } = props;
  const generatedId = React.useId();
  const groupId = id ?? generatedId;
  const labelId = label ? `${groupId}-label` : undefined;
  const messageId = error || hint ? `${groupId}-message` : undefined;

  const items = options.map((option) => (
    <ToggleGroup.Item
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      aria-label={option["aria-label"]}
      role={props.multiple ? undefined : "radio"}
      aria-checked={props.multiple ? undefined : props.value === option.value}
      className={cn(itemClasses, size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-[13px]", fullWidth && "flex-1")}
    >
      {option.icon}
      <span className="truncate">{option.label}</span>
    </ToggleGroup.Item>
  ));

  const common = {
    id: groupId,
    disabled,
    "aria-labelledby": labelId,
    "aria-label": label ? undefined : ariaLabel,
    "aria-describedby": messageId,
    "aria-invalid": error ? true : undefined,
    className: cn(rootClasses, fullWidth && "flex w-full", error && "border-destructive"),
  } as const;

  return (
    <div data-slot="segmented-control" className={cn("min-w-0", className)}>
      {label ? (
        <FieldLabel required={required}>
          <span id={labelId}>{label}</span>
        </FieldLabel>
      ) : null}
      {props.multiple ? (
        <ToggleGroup.Root {...common} type="multiple" value={props.value} onValueChange={(next) => props.onChange(next as T[])}>
          {items}
        </ToggleGroup.Root>
      ) : (
        <ToggleGroup.Root
          {...common}
          type="single"
          role="radiogroup"
          value={props.value}
          // Radix allows deselecting in single mode; a radiogroup always keeps a value.
          onValueChange={(next) => {
            if (next) props.onChange(next as T);
          }}
        >
          {items}
        </ToggleGroup.Root>
      )}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
