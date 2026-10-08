import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

type CardProps = React.ComponentProps<"div"> & {
  /** Legacy convenience header. Prefer CardHeader + CardTitle for new code. */
  title?: string;
  description?: string;
  /**
   * Clickable card: hover/focus brighten the border, fill and title
   * (mark the title with `data-card-title`, or use CardTitle) and reveal a
   * corner arrow. Make the whole card the link with `asChild`.
   */
  interactive?: boolean;
  /** Mark as the selected item in a list (active fill, primary-tinted border). */
  selected?: boolean;
  /** Render the child element (e.g. a Link) as the card. */
  asChild?: boolean;
};

/**
 * A bordered surface panel. Surfaces are separated by 1px borders, not shadows;
 * do not nest Cards inside Cards (use sections with dividers instead).
 */
function Card({ className, title, description, interactive, selected, asChild, children, ...props }: CardProps) {
  const classes = cn(
    "rounded-lg border border-border bg-card text-card-foreground",
    interactive && "card-interactive",
    className
  );
  if (asChild) {
    return (
      <Slot.Root data-slot="card" data-selected={selected || undefined} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <div data-slot="card" data-selected={selected || undefined} className={classes} {...props}>
      {title || description ? (
        <CardHeader>
          <div className="min-w-0">
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </CardHeader>
      ) : null}
      {children}
      {interactive ? <CardArrow /> : null}
    </div>
  );
}

/** Corner arrow that fades in on hover/focus of an interactive card. Place it inside `asChild` cards yourself. */
function CardArrow({ className }: { className?: string }) {
  return (
    <ArrowUpRight
      data-card-arrow
      aria-hidden
      className={cn("pointer-events-none absolute top-3 right-3 size-4 text-brand-accent", className)}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      data-card-title
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("mt-0.5 text-[13px] text-muted-foreground", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("ml-auto flex items-center gap-2", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center justify-end gap-2 border-t border-border px-4 py-3", className)}
      {...props}
    />
  );
}

export { Card, CardArrow, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
