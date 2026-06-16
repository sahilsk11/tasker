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
import { useEffect, useState } from "react";
import type { ApiSession, ApiTaskAction } from "@/api/tasks";
import { MarkdownDocument } from "@/components/MarkdownDocument";
import { Badge } from "@/components/ui/badge";
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
import { localApiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

const defaultWorktreePath = "~/wt";

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
  const recommendedActions = actions.filter((action) => action.isRecommended).slice(0, 2);

  return (
    <div className="mt-auto min-w-0 border-t border-border/70 pt-4">
      <div className="flex flex-wrap justify-center gap-2">
        {recommendedActions.map((action) => (
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
  onBack,
  onOpenChange,
  session,
  taskDescription,
  taskId,
  taskTitle
}: {
  readonly action: ApiTaskAction | null;
  readonly onBack: () => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly session: ApiSession | null;
  readonly taskDescription: string | null;
  readonly taskId: string;
  readonly taskTitle: string;
}): React.JSX.Element {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [createWorktree, setCreateWorktree] = useState(false);
  const [markdownMode, setMarkdownMode] = useState<"edit" | "view">("view");
  const [promptDraft, setPromptDraft] = useState("");
  const [worktreePath, setWorktreePath] = useState(defaultWorktreePath);

  useEffect(() => {
    setCopiedPrompt(false);
  }, [action, createWorktree, session, worktreePath]);

  useEffect(() => {
    setCreateWorktree(false);
    setMarkdownMode("view");
    setWorktreePath(defaultWorktreePath);
  }, [action, session]);

  const claimCommand =
    session == null ? "" : buildCodexClaimCommand(localApiBaseUrl, session.id);
  const worktreeOptions = buildWorktreePromptOptions({
    action,
    createWorktree,
    worktreePath
  });
  const taskNotesPath =
    session == null ? "" : buildSessionTaskNotesPath(taskId, session.id);
  const taskNotesCommand =
    action == null || session == null
      ? ""
      : buildCodexTaskNotesResourceCommand({
          action,
          apiUrl: localApiBaseUrl,
          sessionId: session.id,
          taskNotesPath,
          taskId
        });
  const pullRequestCommand =
    action == null || session == null
      ? ""
      : buildCodexPullRequestResourceCommand({
          apiUrl: localApiBaseUrl,
          taskId
        });
  const prompt =
    action == null || session == null
      ? ""
      : buildCodexActionPrompt({
          action,
          claimCommand,
          pullRequestCommand,
          sessionId: session.id,
          taskNotesCommand,
          taskNotesPath,
          taskDescription,
          taskTitle,
          worktreeOptions
        });

  useEffect(() => {
    setPromptDraft(prompt);
  }, [prompt]);

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
          {action?.id === "implement" ? (
            <section className="grid gap-3 rounded-lg border border-border bg-secondary/30 p-4">
              <label className="flex min-w-0 items-center gap-3 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={createWorktree}
                  onChange={(event) => setCreateWorktree(event.target.checked)}
                  className={cn(
                    "size-4 shrink-0 rounded border border-input bg-background accent-primary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                />
                <span>Create a worktree</span>
              </label>
              <div className="grid gap-2">
                <Label htmlFor="implement-worktree-path">Worktree location</Label>
                <Input
                  id="implement-worktree-path"
                  value={worktreePath}
                  disabled={!createWorktree}
                  placeholder={defaultWorktreePath}
                  onChange={(event) => setWorktreePath(event.target.value)}
                />
              </div>
            </section>
          ) : null}

          <section className="flex h-[min(30rem,calc(100dvh-18rem))] min-h-80 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground">Prompt preview</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyPrompt()}
                  disabled={promptDraft.length === 0}
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
            <MarkdownDocument
              value={promptDraft}
              onChange={setPromptDraft}
              mode={markdownMode}
              className="flex min-h-0 flex-1"
              previewClassName="px-5 py-5"
              textareaClassName="min-h-0"
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildCodexActionPrompt({
  action,
  claimCommand,
  pullRequestCommand,
  sessionId,
  taskNotesCommand,
  taskNotesPath,
  taskDescription,
  taskTitle,
  worktreeOptions
}: {
  readonly action: ApiTaskAction;
  readonly claimCommand: string;
  readonly pullRequestCommand: string;
  readonly sessionId: string;
  readonly taskNotesCommand: string;
  readonly taskNotesPath: string;
  readonly taskDescription: string | null;
  readonly taskTitle: string;
  readonly worktreeOptions: WorktreePromptOptions;
}): string {
  const description = taskDescription?.trim();
  const contextLines = [
    `# ${taskTitle}`,
    ...(description == null || description.length === 0
      ? []
      : ["", "## Description", description]),
    "",
    "## Action",
    action.prompt
  ];
  const worktreeSection = worktreeOptions.createWorktree
    ? `
## Worktree

Before editing files, create an isolated git worktree for this implementation.
Use this location unless it is unavailable:

\`${worktreeOptions.path}\`

Base the worktree on the latest fetched \`origin/main\` or \`origin/master\`, not on
the current checkout's local branch. Leave existing uncommitted changes in the
primary checkout untouched. Do all implementation, verification, commit, push,
and pull request work from inside the worktree.
`
    : "";

  return `${contextLines.join("\n")}${worktreeSection}

## Tasker session claim

Before doing the task, claim this Tasker session.

Run this command from the agent if available:

\`\`\`bash
${claimCommand}
\`\`\`

If CODEX_THREAD_ID is not set, still continue with the task and report that claim failed.

The claim response includes a \`taskOverview\` object with the current task,
selected action, existing resources, child tasks, and \`latestTaskActivityAt\`.
Use that returned overview before deciding what to inspect or change.

## Tasker artifact attribution

When registering artifacts created by this session, include \`"createdBySessionId": "${sessionId}"\`
in the artifact resource payload. Tickets and PR resources do not use session
attribution.

## Tasker task notes

Before finishing, write durable findings and next-step context to:

\`${taskNotesPath}\`

Keep the artifact concise and useful for the next agent. Include decisions made,
files inspected or changed, verification performed, and any remaining risks.

After writing the artifact, register it with Tasker:

\`\`\`bash
${taskNotesCommand}
\`\`\`

If artifact registration fails, still finish the task and report the failure.

## Optional pull request resource

If this task does not need a pull request, skip this section.

If you open a pull request while working on this Tasker session, register the PR
URL before finishing:

\`\`\`bash
${pullRequestCommand}
\`\`\`

If PR registration fails, still finish the task and report the failure.`;
}

type WorktreePromptOptions = {
  readonly createWorktree: boolean;
  readonly path: string;
};

function buildWorktreePromptOptions({
  action,
  createWorktree,
  worktreePath
}: {
  readonly action: ApiTaskAction | null;
  readonly createWorktree: boolean;
  readonly worktreePath: string;
}): WorktreePromptOptions {
  if (action?.id !== "implement" || !createWorktree) {
    return {
      createWorktree: false,
      path: defaultWorktreePath
    };
  }

  const trimmedPath = worktreePath.trim();

  return {
    createWorktree: true,
    path: trimmedPath.length === 0 ? defaultWorktreePath : trimmedPath
  };
}

function buildCodexClaimCommand(apiUrl: string, sessionId: string): string {
  const claimUrl = `${apiUrl}/sessions/${sessionId}/claim`;
  return `curl -sS -X POST "${claimUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "provider": "codex",
  "providerId": "\${CODEX_THREAD_ID:-}",
  "metadata": {
    "reportedCwd": "$(pwd)",
    "codexThreadIdEnvPresent": $([ -n "\${CODEX_THREAD_ID:-}" ] && echo true || echo false)
  }
}
EOF`;
}

function buildSessionTaskNotesPath(taskId: string, sessionId: string): string {
  return `$HOME/.tasker/artifacts/${taskId}/${sessionId}/notes.md`;
}

function buildCodexTaskNotesResourceCommand({
  action,
  apiUrl,
  sessionId,
  taskNotesPath,
  taskId
}: {
  readonly action: ApiTaskAction;
  readonly apiUrl: string;
  readonly sessionId: string;
  readonly taskNotesPath: string;
  readonly taskId: string;
}): string {
  const artifactUrl = `${apiUrl}/tasks/${taskId}/artifacts`;
  const resourceLabel = `${action.label} notes`;

  return `notes_path="${taskNotesPath}"
mkdir -p "$(dirname "$notes_path")"

# Replace this template with the durable context you discovered.
cat > "$notes_path" <<'TASKER_NOTES'
# ${resourceLabel}

## Summary

## Decisions

## Verification

## Remaining risks
TASKER_NOTES

curl -sS -X POST "${artifactUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "createdBySessionId": ${JSON.stringify(sessionId)},
  "label": ${JSON.stringify(getArtifactLabelForAction(action.id))},
  "uri": "$notes_path"
}
EOF`;
}

function buildCodexPullRequestResourceCommand({
  apiUrl,
  taskId
}: {
  readonly apiUrl: string;
  readonly taskId: string;
}): string {
  const pullRequestUrl = `${apiUrl}/tasks/${taskId}/pull-requests`;

  return `pr_url="https://github.com/OWNER/REPO/pull/NUMBER"

curl -sS -X POST "${pullRequestUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "url": "$pr_url"
}
EOF`;
}

function getArtifactLabelForAction(actionId: string): "research" | "plan" | "implement" | "other" {
  if (actionId === "research" || actionId === "plan" || actionId === "implement") {
    return actionId;
  }

  return "other";
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
        {action.isRecommended ? <Badge variant="secondary">Recommended</Badge> : null}
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{action.description}</p>
    </button>
  );
}
