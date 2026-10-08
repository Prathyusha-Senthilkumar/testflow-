"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClasses } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";

export type SearchInputProps = Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> & {
  value: string;
  /** Receives the new string value. */
  onChange: (value: string) => void;
  /** Keyboard hint shown on the right while empty, e.g. "/" or "⌘K". */
  shortcut?: string;
  /** When `shortcut` is "/", pressing "/" anywhere focuses this input. */
  bindShortcut?: boolean;
  /** Classes for the wrapper (width). */
  className?: string;
  /** Classes for the input element. */
  inputClassName?: string;
};

/** Search / filter field for list toolbars: icon, clear button, optional shortcut hint. */
export function SearchInput({
  value,
  onChange,
  shortcut,
  bindShortcut = false,
  placeholder = "Search…",
  className,
  inputClassName,
  "aria-label": ariaLabel,
  ...props
}: SearchInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!bindShortcut || shortcut !== "/") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      ref.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bindShortcut, shortcut]);

  return (
    <div data-slot="search-input" className={cn("relative w-full min-w-0", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
          props.onKeyDown?.(event);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          controlClasses,
          "pl-8 [&::-webkit-search-cancel-button]:hidden",
          value || shortcut ? "pr-9" : undefined,
          inputClassName
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : shortcut ? (
        <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 border border-border bg-elevated">{shortcut}</Kbd>
      ) : null}
    </div>
  );
}
