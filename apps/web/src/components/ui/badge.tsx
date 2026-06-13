import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium leading-none transition-colors",
  {
    defaultVariants: {
      variant: "secondary"
    },
    variants: {
      variant: {
        accent: "border-accent/30 bg-accent/15 text-accent-foreground",
        default: "border-transparent bg-primary text-primary-foreground",
        destructive: "border-destructive/30 bg-destructive/15 text-destructive",
        outline: "border-border bg-transparent text-muted-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning"
      }
    }
  }
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, ...props },
  ref
) {
  return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
});
