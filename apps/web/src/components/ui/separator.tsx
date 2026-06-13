import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  readonly orientation?: "horizontal" | "vertical";
};

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, orientation = "horizontal", ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
});
