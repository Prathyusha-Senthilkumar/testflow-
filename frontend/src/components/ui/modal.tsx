"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Classes for the overlay layer (legacy; kept for compatibility). */
  className?: string;
  /** Classes for the dialog panel, e.g. `max-w-2xl`. */
  panelClassName?: string;
  /** Close when the backdrop is clicked. Off by default so forms and run progress aren't lost by a stray click. */
  closeOnBackdrop?: boolean;
  /** Close on Escape. Off by default for the same reason; the close button always works. */
  closeOnEscape?: boolean;
};

/**
 * Controlled modal with the legacy TestFlow API, built on the Radix Dialog
 * (portal, focus trap, scroll lock).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  panelClassName,
  closeOnBackdrop = false,
  closeOnEscape = false,
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-slot="modal"
        onInteractOutside={(event) => {
          if (!closeOnBackdrop) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!closeOnEscape) event.preventDefault();
        }}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          className,
          panelClassName
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <DialogFooter className="shrink-0 border-t border-border bg-ground/40 px-5 py-3">{footer}</DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
