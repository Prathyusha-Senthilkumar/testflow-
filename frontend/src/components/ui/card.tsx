import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
};

export function Card({ className, title, description, children, ...props }: CardProps) {
  return (
    <div className={cn("rounded-xl bg-white shadow-sm", className)} {...props}>
      {title || description ? (
        <div className="border-b border-slate-100 px-5 py-4">
          {title ? <h3 className="text-base font-semibold text-slate-900">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
