import {
  ClipboardCheck,
  Code2,
  ListTree,
  MapIcon,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ApiTaskAction } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const taskActionIcons: Record<string, LucideIcon> = {
  breakdown: ListTree,
  code_review: ClipboardCheck,
  implement: Code2,
  investigate: Search,
  new_session: MessageSquareText,
  plan: MapIcon
};

export function TaskActionRow({
  actions,
  onViewAll
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onViewAll: () => void;
}): React.JSX.Element {
  const recommendedActions = actions.filter((action) => action.isRecommended).slice(0, 2);

  return (
    <div className="min-w-0 border-t border-border/70 pt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {recommendedActions.map((action) => (
          <TaskActionButton key={action.id} action={action} />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-span-2 min-w-0 justify-center sm:col-span-1"
          onClick={onViewAll}
        >
          <MoreHorizontal className="size-4" />
          <span>View all</span>
        </Button>
      </div>
    </div>
  );
}

export function TaskActionsDialog({
  actions,
  onOpenChange,
  open,
  taskTitle
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly open: boolean;
  readonly taskTitle: string;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Workflow className="size-4" />
            <span className="text-xs font-medium uppercase tracking-[0.12em]">
              Actions
            </span>
          </div>
          <DialogTitle>Task actions</DialogTitle>
          <DialogDescription>
            Suggested prompts for {taskTitle}. Starting sessions is not wired yet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-2 overflow-y-auto border-t border-border p-5">
          {actions.map((action) => (
            <TaskActionListItem key={action.id} action={action} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskActionButton({
  action
}: {
  readonly action: ApiTaskAction;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.id] ?? Workflow;

  return (
    <Button type="button" variant="default" size="sm" className="min-w-0 justify-center">
      <Icon className="size-4" />
      <span>{action.label}</span>
    </Button>
  );
}

function TaskActionListItem({
  action
}: {
  readonly action: ApiTaskAction;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.id] ?? Workflow;

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-border p-3 text-left",
        "transition-colors hover:bg-secondary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{action.label}</span>
        {action.isRecommended ? <Badge variant="secondary">Recommended</Badge> : null}
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{action.description}</p>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
        {action.prompt}
      </p>
    </button>
  );
}
