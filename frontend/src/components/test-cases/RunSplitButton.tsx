"use client";

import { ChevronDown, Play } from "lucide-react";
import type { EnvironmentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RunSplitButtonProps = {
  onRun: (environmentId?: string) => void;
  running: boolean;
  disabled: boolean;
  /** Environments this test can run against. */
  environments: EnvironmentSummary[];
  environmentId: string;
  onEnvironmentChange: (id: string) => void;
};

/** Primary Run button with an environment picker on its chevron. */
export function RunSplitButton({ onRun, running, disabled, environments, environmentId, onEnvironmentChange }: RunSplitButtonProps) {
  const current = environments.find((env) => env.id === environmentId);
  return (
    <div className="inline-flex" role="group" aria-label="Run test">
      <Button
        onClick={() => onRun()}
        disabled={disabled}
        loading={running}
        className="rounded-r-none"
        title={current ? `Run on ${current.name}` : "Run test"}
      >
        {!running ? <Play /> : null}
        {running ? "Running…" : "Run"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            disabled={disabled || environments.length === 0}
            aria-label="Choose environment and run"
            className="w-8 rounded-l-none border-l border-primary-foreground/20"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Environment</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={environmentId} onValueChange={onEnvironmentChange}>
            {environments.map((env) => (
              <DropdownMenuRadioItem key={env.id} value={env.id} className="text-[13px]">
                <span className="truncate">{env.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onRun(environmentId)} className="text-[13px]">
            <Play />
            Run on {current?.name ?? "selected environment"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
