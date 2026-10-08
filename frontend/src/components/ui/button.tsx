import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { AttestLoader } from "@/components/brand/attest-loader";

/**
 * Button variants. Legacy names are kept as aliases so existing callers work:
 * `primary` = `default`, `secondary` = `outline`, `danger` = `destructive`.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:brightness-95",
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:brightness-95",
        outline: "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-state-hover active:bg-state-pressed",
        secondary: "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-state-hover active:bg-state-pressed",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:border dark:border-destructive/40 dark:bg-destructive-soft dark:text-destructive dark:hover:bg-destructive/20",
        danger:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:border dark:border-destructive/40 dark:bg-destructive-soft dark:text-destructive dark:hover:bg-destructive/20",
        ghost: "text-muted-foreground hover:bg-state-hover hover:text-foreground active:bg-state-pressed",
        link: "h-auto px-0 text-brand-accent underline-offset-4 hover:text-foreground hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-[13px]",
        lg: "h-10 px-5",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
};

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  asChild = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot.Root data-slot="button" data-variant={variant} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {loading ? <AttestLoader size="sm" tone="current" decorative /> : null}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
