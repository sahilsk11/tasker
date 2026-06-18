import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn("fixed inset-0 z-50 bg-background/80 backdrop-blur-sm", className)}
      {...props}
    />
  );
});

type DialogContentLayout = "content" | "standard" | "large";

const dialogContentLayoutClasses: Record<DialogContentLayout, string> = {
  content: "",
  large: "h-[min(46rem,calc(100dvh-2rem))] md:h-[min(46rem,calc(100dvh-3rem))]",
  standard: "h-[min(42rem,calc(100dvh-2rem))] md:h-[min(42rem,calc(100dvh-3rem))]"
};

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  readonly layout?: DialogContentLayout;
};

export const DialogContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ children, className, layout = "content", ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-4 z-50 grid w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 gap-4 rounded-xl border border-border bg-card p-0 shadow-2xl md:top-6",
          "max-h-[calc(100dvh-2rem)] overflow-hidden md:max-h-[calc(100dvh-3rem)]",
          dialogContentLayoutClasses[layout],
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn("grid gap-2 p-5 pr-12 pb-4", className)} {...props} />;
}

export const DialogTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-normal", className)}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  );
});
