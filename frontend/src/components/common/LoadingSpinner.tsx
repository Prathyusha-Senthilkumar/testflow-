"use client";

import { LoaderCircle } from "lucide-react";

type LoadingSpinnerProps = {
  label?: string;
  compact?: boolean;
  className?: string;
};

export function LoadingSpinner({ label = "Loading…", compact = false, className = "" }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center ${compact ? "gap-2" : "justify-center gap-3 py-10"} text-sm text-slate-500 ${className}`}
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
