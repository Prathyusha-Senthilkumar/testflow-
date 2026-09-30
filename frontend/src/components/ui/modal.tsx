import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  panelClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  panelClassName,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4", className)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="testflow-modal-title"
    >
      <div className={cn("w-full max-w-lg rounded-2xl bg-white shadow-xl", panelClassName)}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="testflow-modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
