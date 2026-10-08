"use client";

import { useRef, useState } from "react";
import { CalendarClock, Check, ChevronDown, Play, SlidersHorizontal } from "lucide-react";
import type { EnvironmentSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MENU_ITEM = "gap-1.5 px-2 py-1 text-[13px]";

export type RunMenuButtonProps = {
  /** Button text, e.g. "Run", "Run suite", "Run project". */
  label?: string;
  /** Text while a run is starting. */
  runningLabel?: string;
  /** Main click: run now on the environment the button uses (the default). */
  onRun: () => void;
  /** Environments listed under "Run on". Shown only together with `onRunOn`. */
  environments?: EnvironmentSummary[];
  /** The environment the main button runs on; it gets the check. */
  selectedEnvironmentId?: string;
  /** The project default; it gets a small "default" tag. */
  defaultEnvironmentId?: string;
  /** Picking an environment runs once on it. It never changes a default. */
  onRunOn?: (environmentId: string) => void;
  /** Adds "Run with options…" (e.g. the project dialog with a category filter). */
  onRunWithOptions?: () => void;
  /** Adds "Schedule run…". */
  onSchedule?: () => void;
  running?: boolean;
  disabled?: boolean;
  /** Disables "Schedule run…" separately from Run. Defaults to `disabled`. */
  scheduleDisabled?: boolean;
  /** Tooltip for the main button, e.g. "Run on Staging". */
  title?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
};

/** Split Run button. The chevron lists environments to run on once, plus optional "Run with options…" and "Schedule run…". */
export function RunMenuButton({
  label = "Run",
  runningLabel = "Running…",
  onRun,
  environments,
  selectedEnvironmentId,
  defaultEnvironmentId,
  onRunOn,
  onRunWithOptions,
  onSchedule,
  running = false,
  disabled = false,
  scheduleDisabled,
  title,
  variant = "default",
  size = "default",
  className,
}: RunMenuButtonProps) {
  // The menu is as wide as the Run button group, growing only when labels need it.
  const groupRef = useRef<HTMLDivElement>(null);
  const [menuWidth, setMenuWidth] = useState<number>();
  const outline = variant === "outline";
  const cannotSchedule = scheduleDisabled ?? disabled;
  const listed = onRunOn && environments?.length ? environments : [];
  const actions = Boolean(onRunWithOptions || onSchedule);
  const hasMenu = listed.length > 0 || actions;

  const main = (
    <Button
      variant={variant}
      size={size}
      onClick={onRun}
      disabled={disabled}
      loading={running}
      className={hasMenu ? "rounded-r-none" : undefined}
      title={title}
    >
      {!running ? <Play /> : null}
      {running ? runningLabel : label}
    </Button>
  );

  if (!hasMenu) return <div className={cn("inline-flex", className)}>{main}</div>;

  return (
    <div
      ref={groupRef}
      className={cn("inline-flex", className)}
      role="group"
      aria-label={label}
      // Inside clickable table rows the button and its (portalled) menu must not open the row.
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {main}
      <DropdownMenu onOpenChange={(open) => open && setMenuWidth(groupRef.current?.offsetWidth)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size === "sm" ? "icon-sm" : "icon"}
            disabled={disabled && cannotSchedule}
            aria-label={`${label}: more options`}
            className={cn(
              "rounded-l-none",
              size === "sm" ? "w-7" : "w-8",
              outline ? "-ml-px" : "border-l border-primary-foreground/20"
            )}
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-max max-w-72 p-1" style={{ minWidth: menuWidth }}>
          {listed.length > 0 ? (
            <>
              <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">Run on</DropdownMenuLabel>
              {listed.map((env) => (
                <DropdownMenuItem
                  key={env.id}
                  onSelect={() => onRunOn?.(env.id)}
                  disabled={disabled}
                  title={env.baseUrl}
                  className={MENU_ITEM}
                >
                  <Check className={env.id === selectedEnvironmentId ? "size-3.5 text-primary" : "invisible size-3.5"} />
                  <span className="min-w-0 truncate">{env.name}</span>
                  {env.id === defaultEnvironmentId ? (
                    <span className="ml-auto pl-2 text-[11px] text-muted-foreground">default</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {listed.length > 0 && actions ? <DropdownMenuSeparator /> : null}
          {onRunWithOptions ? (
            <DropdownMenuItem onSelect={onRunWithOptions} disabled={disabled} className={MENU_ITEM}>
              <SlidersHorizontal className="size-3.5" />
              <span className="truncate">Run with options…</span>
            </DropdownMenuItem>
          ) : null}
          {onSchedule ? (
            <DropdownMenuItem onSelect={onSchedule} disabled={cannotSchedule} className={MENU_ITEM}>
              <CalendarClock className="size-3.5" />
              <span className="truncate">Schedule run…</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
