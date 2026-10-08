"use client";

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  /** Plain-language consequence; name the item in bold. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** For high-impact deletes: the user must type this text to enable the confirm button. */
  requireText?: string;
  /**
   * Optional async action. The dialog stays open (confirm button shows a loader)
   * until it resolves; if it throws, the error shows inline and the dialog stays open.
   */
  onConfirm?: () => Promise<void> | void;
};

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean;
  /** Called with true after a successful confirm, false on cancel/Esc. */
  onResolve: (confirmed: boolean) => void;
  /** Storybook/testing: force the busy or error state. */
  busy?: boolean;
  error?: string | null;
};

/**
 * In-app confirmation dialog (replaces window.confirm). Cancel is focused by
 * default for danger actions; Esc and Cancel resolve false.
 */
export function ConfirmDialog({
  open,
  onResolve,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  requireText,
  onConfirm,
  busy: forcedBusy,
  error: forcedError,
}: ConfirmDialogProps) {
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isBusy = forcedBusy ?? busy;
  const shownError = forcedError ?? error;
  const blocked = Boolean(requireText) && typed.trim() !== requireText?.trim();

  function reset() {
    setTyped("");
    setBusy(false);
    setError(null);
  }

  async function confirm() {
    if (blocked || isBusy) return;
    if (!onConfirm) {
      reset();
      onResolve(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      reset();
      onResolve(true);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isBusy) {
          reset();
          onResolve(false);
        }
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          // Danger: focus Cancel so Enter never deletes by accident (unless a text must be typed first).
          if (tone === "danger" && !requireText) {
            event.preventDefault();
            cancelRef.current?.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription asChild><div className="space-y-2 [&_strong]:font-semibold [&_strong]:text-foreground">{description}</div></AlertDialogDescription> : null}
        </AlertDialogHeader>
        {requireText ? (
          <div>
            <label htmlFor={inputId} className="mb-1.5 block text-[13px] text-muted-foreground">
              Type <strong className="font-mono text-foreground">{requireText}</strong> to confirm
            </label>
            <Input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={isBusy}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void confirm();
                }
              }}
            />
          </div>
        ) : null}
        {shownError ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {shownError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={isBusy}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={blocked}
            loading={isBusy}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mount once (app shell). Provides `useConfirm()`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setState({ options, resolve });
      }),
    []
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        key={state ? state.options.title : "closed"}
        open={Boolean(state)}
        {...(state?.options ?? { title: "" })}
        onResolve={(confirmed) => {
          state?.resolve(confirmed);
          setState(null);
        }}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * `const confirm = useConfirm(); if (await confirm({ title, tone: "danger", ... })) …`
 * Falls back to resolving false (never a native dialog) if no provider is mounted.
 */
export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  return context ?? (async () => false);
}
