import { ChevronDown } from "lucide-react";
import { type SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  function NativeSelect({ children, className, ...props }, ref) {
    return (
      <span className="relative block">
        <select
          ref={ref}
          className={cn(
            "h-10 w-full appearance-none rounded-md border border-input bg-secondary/50 px-3 pr-9 text-sm text-foreground",
            "transition-colors focus:border-border focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    );
  }
);
