"use client";

import type { ReactNode } from "react";
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "lucide-react";
import { AttestLogo } from "@/components/brand/attest-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";

type AuthLayoutProps = {
  /** Panel heading, e.g. "Sign in to Attest". */
  title: string;
  /** One line under the heading. */
  description?: ReactNode;
  children: ReactNode;
  /** Secondary links under the panel (e.g. "Back to sign in"). */
  footer?: ReactNode;
};

/**
 * Centered layout for the signed-out pages (login, forgot and reset password).
 * Follows the theme and offers a theme toggle in the corner.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <AttestLogo variant="tile" markClassName="size-10" wordmarkClassName="text-2xl" className="gap-3" />
          <section
            aria-labelledby="auth-title"
            className="mt-8 w-full max-w-[400px] rounded-lg border border-border bg-surface p-6 sm:p-7"
          >
            <h1 id="auth-title" className="text-lg font-semibold tracking-[-0.01em]">
              {title}
            </h1>
            {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
            <div className="mt-6">{children}</div>
          </section>
          {footer ? <div className="mt-4 text-center text-[13px] text-muted-foreground">{footer}</div> : null}
        </main>
        <footer className="pb-6 text-center text-xs text-faint">
          Attest · Functional and responsive browser testing
        </footer>
      </div>
    </TooltipProvider>
  );
}

/** Small show/hide toggle placed inside a password Input (wrap both in `relative`). */
export function PasswordVisibilityToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      onClick={onToggle}
      className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
    </button>
  );
}
