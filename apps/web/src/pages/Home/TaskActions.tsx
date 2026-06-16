import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Copy,
  Code2,
  LoaderCircle,
  ListTree,
  MapIcon,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Save,
  Search,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { defaultWorktreePath } from "@tasker/core";
import { useEffect, useRef, useState } from "react";
import type { ApiSession, ApiTaskAction, TaskActionPromptValues } from "@/api/tasks";
import { renderTaskSessionPrompt } from "@/api/tasks";
import { MarkdownDocument } from "@/components/MarkdownDocument";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const quickActionCount = 2;

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
  onSelectAction,
  onViewAll
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onSelectAction: (action: ApiTaskAction) => void;
  readonly onViewAll: () => void;
}): React.JSX.Element {
  const quickActions = actions.slice(0, quickActionCount);

  return (
    <div className="mt-auto min-w-0 border-t border-border/70 pt-4">
      <div className="flex flex-wrap justify-center gap-2">
        {quickActions.map((action) => (
          <TaskActionButton
            key={action.id}
            action={action}
            onSelect={() => onSelectAction(action)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-36 min-w-0 px-3"
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
  error,
  isPreparingPrompt,
  onOpenChange,
  onSelectAction,
  open,
  taskTitle
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly error: string | null;
  readonly isPreparingPrompt: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSelectAction: (action: ApiTaskAction) => void;
  readonly open: boolean;
  readonly taskTitle: string;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl grid-rows-[auto_minmax(0,1fr)]">
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
          <TaskActionDialogStatus error={error} isPreparingPrompt={isPreparingPrompt} />
        </DialogHeader>
        <div className="grid min-h-0 gap-2 overflow-y-auto border-t border-border p-5 md:grid-cols-2">
          {actions.map((action) => (
            <TaskActionListItem
              key={action.id}
              action={action}
              disabled={isPreparingPrompt}
              onSelect={() => onSelectAction(action)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaskActionPromptDialog({
  action,
  initialPrompt,
  onBack,
  onOpenChange,
  session,
  taskId
}: {
  readonly action: ApiTaskAction | null;
  readonly initialPrompt: string | null;
  readonly onBack: () => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly session: ApiSession | null;
  readonly taskId: string;
}): React.JSX.Element {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [createWorktree, setCreateWorktree] = useState(false);
  const [markdownMode, setMarkdownMode] = useState<"edit" | "view">("view");
  const [promptDraft, setPromptDraft] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [worktreePath, setWorktreePath] = useState(defaultWorktreePath);
  const optionsAdjustedRef = useRef(false);

  const worktreeOption = action?.options?.worktree ?? null;
  const defaultWorktreePathValue =
    worktreeOption?.fields?.path?.default ?? defaultWorktreePath;

  useEffect(() => {
    setCopiedPrompt(false);
  }, [action, createWorktree, promptDraft, session, worktreePath]);

  useEffect(() => {
    optionsAdjustedRef.current = false;
    setCreateWorktree(worktreeOption?.default ?? false);
    setMarkdownMode("view");
    setPromptDraft(initialPrompt ?? "");
    setPromptError(null);
    setWorktreePath(defaultWorktreePathValue);
  }, [action, defaultWorktreePathValue, initialPrompt, session, worktreeOption?.default]);

  useEffect(() => {
    if (action == null || session == null || !optionsAdjustedRef.current) {
      return;
    }

    let cancelled = false;
    setIsLoadingPrompt(true);
    setPromptError(null);

    const options = buildPromptOptions({
      createWorktree,
      worktreePath
    });

    void renderTaskSessionPrompt(taskId, session.id, options)
      .then((prompt) => {
        if (!cancelled) {
          setPromptDraft(prompt);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPromptError(
            error instanceof Error ? error.message : "Failed to load action prompt."
          );
          setPromptDraft("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrompt(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [action, createWorktree, session, taskId, worktreePath]);

  function handleWorktreeToggle(enabled: boolean): void {
    optionsAdjustedRef.current = true;
    setCreateWorktree(enabled);
  }

  function handleWorktreePathChange(path: string): void {
    optionsAdjustedRef.current = true;
    setWorktreePath(path);
  }

  async function copyPrompt(): Promise<void> {
    if (promptDraft.length === 0) {
      return;
    }

    await copyPlainText(promptDraft);
    setCopiedPrompt(true);
  }

  const Icon = action == null ? Workflow : taskActionIcons[action.id] ?? Workflow;

  return (
    <Dialog open={action != null && session != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-4 top-4 z-10"
          onClick={onBack}
          aria-label="Back to task actions"
          title="Back to task actions"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <DialogHeader className="gap-3 p-5 pb-5 pl-12 pr-12 pt-14">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <DialogTitle>{action?.label ?? "Action prompt"}</DialogTitle>
          </div>
          <DialogDescription className="mt-1">{action?.description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto border-t border-border p-5">
          {worktreeOption == null ? null : (
            <section className="grid gap-3 rounded-lg border border-border bg-secondary/30 p-4">
              <label className="flex min-w-0 items-center gap-3 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={createWorktree}
                  onChange={(event) => handleWorktreeToggle(event.target.checked)}
                  className={cn(
                    "size-4 shrink-0 rounded border border-input bg-background accent-primary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                />
                <span>{worktreeOption.label}</span>
              </label>
              <div className="grid gap-2">
                <Label htmlFor="action-worktree-path">Worktree location</Label>
                <Input
                  id="action-worktree-path"
                  value={worktreePath}
                  disabled={!createWorktree}
                  placeholder={defaultWorktreePathValue}
                  onChange={(event) => handleWorktreePathChange(event.target.value)}
                />
              </div>
            </section>
          )}

          <section className="flex h-[min(30rem,calc(100dvh-18rem))] min-h-80 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground">Prompt preview</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyPrompt()}
                  disabled={promptDraft.length === 0 || isLoadingPrompt}
                >
                  {copiedPrompt ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  <span>{copiedPrompt ? "Copied" : "Copy"}</span>
                </Button>
                {markdownMode === "view" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMarkdownMode("edit")}
                    disabled={isLoadingPrompt}
                  >
                    <Pencil className="size-4" />
                    <span>Edit</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setMarkdownMode("view")}
                  >
                    <Save className="size-4" />
                    <span>Save</span>
                  </Button>
                )}
              </div>
            </div>
            {promptError != null ? (
              <p className="px-5 py-4 text-sm text-destructive">{promptError}</p>
            ) : isLoadingPrompt ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                <span>Loading prompt...</span>
              </p>
            ) : (
              <MarkdownDocument
                value={promptDraft}
                onChange={setPromptDraft}
                mode={markdownMode}
                className="flex min-h-0 flex-1"
                previewClassName="px-5 py-5"
                textareaClassName="min-h-0"
              />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildPromptOptions({
  createWorktree,
  worktreePath
}: {
  readonly createWorktree: boolean;
  readonly worktreePath: string;
}): TaskActionPromptValues {
  return {
    worktree: {
      enabled: createWorktree,
      ...(createWorktree ? { path: worktreePath } : {})
    }
  };
}

async function copyPlainText(value: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([value], { type: "text/plain" })
      })
    ]);
    return;
  }

  await navigator.clipboard.writeText(value);
}

function TaskActionButton({
  action,
  onSelect
}: {
  readonly action: ApiTaskAction;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.id] ?? Workflow;

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      className="h-8 w-36 min-w-0 px-3"
      onClick={onSelect}
    >
      <Icon className="size-4" />
      <span>{action.label}</span>
    </Button>
  );
}

function TaskActionDialogStatus({
  error,
  isPreparingPrompt
}: {
  readonly error: string | null;
  readonly isPreparingPrompt: boolean;
}): React.JSX.Element | null {
  if (error != null) {
    return (
      <p className="flex min-w-0 items-center gap-2 text-sm leading-6 text-destructive">
        {error}
      </p>
    );
  }

  if (!isPreparingPrompt) {
    return null;
  }

  return (
    <p
      className="flex min-w-0 items-center gap-2 text-sm leading-6 text-muted-foreground"
      aria-live="polite"
    >
      <LoaderCircle className="size-4 shrink-0 animate-spin" />
      <span>Preparing prompt...</span>
    </p>
  );
}

function TaskActionListItem({
  action,
  disabled,
  onSelect
}: {
  readonly action: ApiTaskAction;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.id] ?? Workflow;

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-border p-3 text-left",
        "transition-colors hover:bg-secondary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-transparent"
      )}
      disabled={disabled}
      onClick={onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{action.label}</span>
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{action.description}</p>
    </button>
  );
}
