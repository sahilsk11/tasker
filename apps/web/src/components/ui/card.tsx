import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <article
        ref={ref}
        className={cn(
          "min-w-0 rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]",
          className
        )}
        {...props}
      />
    );
  }
);

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("min-w-0 p-5 pb-3", className)} {...props} />;
  }
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn("text-base font-semibold leading-6 tracking-normal", className)}
        {...props}
      />
    );
  }
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("min-w-0 p-5 pt-0", className)} {...props} />;
  }
);
