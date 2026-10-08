"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldLabel, FieldMessage } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type MultiSelectOption = { value: string; label: string; disabled?: boolean };

export type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  placeholder?: string;
  /** Placeholder for the filter box inside the popover. */
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  id?: string;
  className?: string;
  /** Show a filter box (default: when there are more than 6 options). */
  searchable?: boolean;
};

/**
 * Multi-choice picker: trigger shows the selection as removable chips, the
 * popover is a keyboard-navigable checklist (cmdk) with optional filtering.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Filter…",
  emptyText = "No options",
  disabled,
  required,
  error,
  hint,
  id,
  className,
  searchable,
}: MultiSelectProps) {
  const generatedId = React.useId();
  const triggerId = id ?? generatedId;
  const messageId = error || hint ? `${triggerId}-message` : undefined;
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((option) => value.includes(option.value));
  const showSearch = searchable ?? options.length > 6;

  function toggle(optionValue: string) {
    onChange(value.includes(optionValue) ? value.filter((current) => current !== optionValue) : [...value, optionValue]);
  }

  return (
    <div className={cn("w-full min-w-0", className)}>
      {label ? (
        <FieldLabel htmlFor={triggerId} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={triggerId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={cn(
            "flex min-h-9 w-full items-center gap-1.5 rounded-md border border-input bg-surface py-1 pr-2 pl-1.5 text-left text-sm text-foreground transition-[border-color,box-shadow] duration-150 outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted-foreground aria-invalid:border-destructive data-[state=open]:border-ring"
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="px-1.5 text-faint">{placeholder}</span>
            ) : (
              selected.map((option) => (
                <span key={option.value} className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-elevated pr-0.5 pl-1.5 text-xs">
                  {option.label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${option.label}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(option.value);
                    }}
                    className="grid size-4 place-items-center rounded-[3px] text-muted-foreground hover:bg-border hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </span>
                </span>
              ))
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
          <Command>
            {showSearch ? <CommandInput placeholder={searchPlaceholder} className="h-9" /> : null}
            <CommandList className="max-h-64">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const checked = value.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value}`}
                      disabled={option.disabled}
                      onSelect={() => toggle(option.value)}
                      aria-checked={checked}
                      role="option"
                      className="gap-2 py-1.5 text-[13px]"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                          checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface"
                        )}
                      >
                        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      {option.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            {value.length > 0 ? (
              <div className="flex items-center justify-between border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{value.length} selected</span>
                <button type="button" onClick={() => onChange([])} className="rounded-sm px-1.5 py-0.5 hover:bg-elevated hover:text-foreground">
                  Clear
                </button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
