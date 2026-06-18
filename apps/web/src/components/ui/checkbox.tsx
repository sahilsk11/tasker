import { Check } from "lucide-react";
import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref
) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "peer size-4 appearance-none rounded border border-input bg-secondary/50",
          "transition-colors checked:border-primary checked:bg-primary",
          "focus:outline-none focus:ring-2 focus:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  );
});
