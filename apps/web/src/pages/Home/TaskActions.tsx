import {
  Check,
  ClipboardCheck,
  Copy,
  Code2,
  ListTree,
  MapIcon,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiSession, ApiTaskAction } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { localApiBaseUrl } from "@/lib/env";
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
  onSelectAction,
  onViewAll
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onSelectAction: (action: ApiTaskAction) => void;
  readonly onViewAll: () => void;
}): React.JSX.Element {
  const recommendedActions = actions.filter((action) => action.isRecommended).slice(0, 2);

  return (
    <div className="min-w-0 border-t border-border/70 pt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
  onSelectAction,
  open,
  taskTitle
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSelectAction: (action: ApiTaskAction) => void;
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
            <TaskActionListItem
              key={action.id}
              action={action}
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
  onOpenChange,
  session,
  taskDescription,
  taskId,
  taskTitle
}: {
  readonly action: ApiTaskAction | null;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly session: ApiSession | null;
  readonly taskDescription: string | null;
  readonly taskId: string;
  readonly taskTitle: string;
}): React.JSX.Element {
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    setCopiedPrompt(false);
  }, [action, session]);

  const claimCommand =
    session == null ? "" : buildCodexClaimCommand(localApiBaseUrl, session.id);
  const artifactPath =
    session == null ? "" : buildSessionArtifactPath(taskId, session.id);
  const artifactCommand =
    action == null || session == null
      ? ""
      : buildCodexArtifactCommand({
          action,
          apiUrl: localApiBaseUrl,
          artifactPath,
          taskId
        });
  const prompt =
    action == null || session == null
      ? ""
      : buildCodexActionPrompt({
          action,
          artifactCommand,
          artifactPath,
          claimCommand,
          taskDescription,
          taskTitle
        });

  async function copyPrompt(): Promise<void> {
    if (prompt.length === 0) {
      return;
    }

    await copyPlainText(prompt);
    setCopiedPrompt(true);
  }

  const Icon = action == null ? Workflow : taskActionIcons[action.id] ?? Workflow;

  return (
    <Dialog open={action != null && session != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader>
          <div className="p-5 pb-0">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="size-4" />
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                Codex prompt
              </span>
            </div>
            <DialogTitle>{action?.label ?? "Action prompt"}</DialogTitle>
            <DialogDescription>
              Copy this markdown prompt into Codex. The claim command uses the
              local Tasker API, not this browser URL.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto border-t border-border p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Prompt preview</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyPrompt()}
              disabled={prompt.length === 0}
            >
              {copiedPrompt ? <Check className="size-4" /> : <Copy className="size-4" />}
              <span>{copiedPrompt ? "Copied" : "Copy prompt"}</span>
            </Button>
          </div>
          {action == null || session == null ? null : (
            <CodexPromptPreview
              action={action}
              artifactCommand={artifactCommand}
              artifactPath={artifactPath}
              claimCommand={claimCommand}
              taskDescription={taskDescription}
              taskTitle={taskTitle}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CodexPromptPreview({
  action,
  artifactCommand,
  artifactPath,
  claimCommand,
  taskDescription,
  taskTitle
}: {
  readonly action: ApiTaskAction;
  readonly artifactCommand: string;
  readonly artifactPath: string;
  readonly claimCommand: string;
  readonly taskDescription: string | null;
  readonly taskTitle: string;
}): React.JSX.Element {
  const description = taskDescription?.trim();

  return (
    <div className="grid gap-4 text-sm leading-6">
      <section className="grid gap-2 border-b border-border pb-4">
        <h3 className="text-base font-semibold text-foreground">{taskTitle}</h3>
        {description == null || description.length === 0 ? null : (
          <p className="text-muted-foreground">{description}</p>
        )}
      </section>

      <section className="grid gap-2 border-b border-border pb-4">
        <h4 className="font-medium text-foreground">Action</h4>
        <p className="text-muted-foreground">{action.prompt}</p>
      </section>

      <section className="grid gap-3 border-b border-border pb-4">
        <div className="grid gap-1">
          <h4 className="font-medium text-foreground">Tasker artifact handoff</h4>
          <p className="text-muted-foreground">
            Before finishing, write durable findings to {artifactPath} and register
            that file with Tasker.
          </p>
        </div>
        <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-secondary/40 p-4 font-mono text-xs leading-5 text-foreground">
          {artifactCommand}
        </pre>
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h4 className="font-medium text-foreground">Tasker session claim</h4>
          <p className="text-muted-foreground">
            Before doing the task, claim this Tasker session. If CODEX_THREAD_ID
            is not set, continue with the task and report that claim failed.
          </p>
        </div>
        <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-secondary/40 p-4 font-mono text-xs leading-5 text-foreground">
          {claimCommand}
        </pre>
      </section>
    </div>
  );
}

function buildCodexActionPrompt({
  action,
  artifactCommand,
  artifactPath,
  claimCommand,
  taskDescription,
  taskTitle
}: {
  readonly action: ApiTaskAction;
  readonly artifactCommand: string;
  readonly artifactPath: string;
  readonly claimCommand: string;
  readonly taskDescription: string | null;
  readonly taskTitle: string;
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

  return `${contextLines.join("\n")}

## Tasker session claim

Before doing the task, claim this Tasker session.

Run this command from the agent if available:

\`\`\`bash
${claimCommand}
\`\`\`

If CODEX_THREAD_ID is not set, still continue with the task and report that claim failed.

## Tasker artifact handoff

Before finishing, write durable findings and next-step context to:

\`${artifactPath}\`

Keep the artifact concise and useful for the next agent. Include decisions made,
files inspected or changed, verification performed, and any remaining risks.

After writing the artifact, register it with Tasker:

\`\`\`bash
${artifactCommand}
\`\`\`

If artifact registration fails, still finish the task and report the failure.`;
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

function buildSessionArtifactPath(taskId: string, sessionId: string): string {
  return `$HOME/.tasker/artifacts/${taskId}/${sessionId}/handoff.md`;
}

function buildCodexArtifactCommand({
  action,
  apiUrl,
  artifactPath,
  taskId
}: {
  readonly action: ApiTaskAction;
  readonly apiUrl: string;
  readonly artifactPath: string;
  readonly taskId: string;
}): string {
  const artifactUrl = `${apiUrl}/tasks/${taskId}/artifacts`;
  const artifactLabel = `${action.label} handoff`;

  return `artifact_path="${artifactPath}"
mkdir -p "$(dirname "$artifact_path")"

# Replace this template with the durable context you discovered.
cat > "$artifact_path" <<'TASKER_ARTIFACT'
# ${artifactLabel}

## Summary

## Decisions

## Verification

## Remaining risks
TASKER_ARTIFACT

curl -sS -X POST "${artifactUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "kind": "handoff",
  "label": ${JSON.stringify(artifactLabel)},
  "uri": "$artifact_path"
}
EOF`;
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
      className="min-w-0 justify-center"
      onClick={onSelect}
    >
      <Icon className="size-4" />
      <span>{action.label}</span>
    </Button>
  );
}

function TaskActionListItem({
  action,
  onSelect
}: {
  readonly action: ApiTaskAction;
  readonly onSelect: () => void;
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
      onClick={onSelect}
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
