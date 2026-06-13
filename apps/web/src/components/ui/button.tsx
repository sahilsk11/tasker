import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "md",
      variant: "default"
    },
    variants: {
      size: {
        icon: "size-8",
        md: "h-9 px-3",
        sm: "h-8 px-2.5"
      },
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        outline: "border border-border bg-transparent text-foreground hover:bg-secondary"
      }
    }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { asChild = false, className, size, type = "button", variant, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ className, size, variant }))}
      {...(!asChild ? { type } : {})}
      {...props}
    />
  );
});
