import { ArrowRight, Check, Rocket } from "lucide-react";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@/lib/dashboard";
import { Card } from "@/components/ui/card";

/** First-run checklist; each step links to its page and ticks itself off from data. */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done && !step.optional) ?? steps.find((step) => !step.done);
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-elevated text-brand-accent">
          <Rocket className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">Get your first test running</h2>
          <p className="text-[13px] text-muted-foreground">
            The dashboard fills in once you have runs. <span className="tabular-nums">{done} of {steps.length}</span> steps done.
          </p>
        </div>
      </div>
      <ol className="divide-y divide-border-subtle">
        {steps.map((step, index) => {
          const isNext = step === next;
          return (
            <li key={step.id}>
              <Link
                // "Record a test" opens a fresh draft directly (the /new route creates it).
                to={step.id === "record" && !step.done && step.href.endsWith("/test-cases") ? `${step.href}/new` : step.href}
                className={cn(
                  "group flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none",
                  isNext && "bg-state-active"
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums",
                    step.done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {step.done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span className={cn("flex-1 text-[13px]", step.done ? "text-muted-foreground line-through decoration-border-strong" : "font-medium text-foreground")}>
                  {step.label}
                  {step.optional ? <span className="ml-1.5 text-xs font-normal text-faint no-underline">optional</span> : null}
                  <span className="sr-only">{step.done ? " (done)" : ""}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
