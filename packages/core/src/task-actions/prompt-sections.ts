import type { TaskActionPromptContext } from "./types.js";

export const defaultWorktreePath = "~/wt";

export function buildTaskHeaderSection(
  context: Pick<TaskActionPromptContext, "taskDescription" | "taskTitle">
): string {
  const description = context.taskDescription?.trim();
  if (description == null || description.length === 0) {
    return `# ${context.taskTitle}`;
  }

  return `# ${context.taskTitle}\n\n## Description\n${description}`;
}

export function buildWorktreeSection(context: TaskActionPromptContext): string {
  if (context.worktree?.enabled !== true) {
    return "";
  }

  const path =
    context.worktree.path.trim().length === 0
      ? defaultWorktreePath
      : context.worktree.path.trim();

  return `## Worktree

Before editing files, create an isolated git worktree for this implementation.
Use this location unless it is unavailable:

\`${path}\`

Base the worktree on the latest fetched \`origin/main\` or \`origin/master\`, not on
the current checkout's local branch. Leave existing uncommitted changes in the
primary checkout untouched. Do all implementation, verification, commit, push,
and pull request work from inside the worktree.`;
}

export function buildSessionClaimSection(context: TaskActionPromptContext): string {
  const claimCommand = buildCodexClaimCommand(context.apiBaseUrl, context.sessionId);

  return `## Tasker session claim

Before doing the task, claim this Tasker session.

Run this command from the agent if available:

\`\`\`bash
${claimCommand}
\`\`\`

If CODEX_THREAD_ID is not set, still continue with the task and report that claim failed.

The claim response includes a \`taskOverview\` object with the current task,
selected action, existing resources, child tasks, and \`latestTaskActivityAt\`.
Use that returned overview before deciding what to inspect or change.`;
}

export function buildArtifactAttributionSection(context: TaskActionPromptContext): string {
  return `## Tasker artifact attribution

When registering artifacts created by this session, include \`"createdBySessionId": "${context.sessionId}"\`
in the artifact resource payload. Tickets and PR resources do not use session
attribution.`;
}

export function buildTaskNotesRegistrationSection(context: TaskActionPromptContext): string {
  const taskNotesPath = buildSessionTaskNotesPath(context.taskId, context.sessionId);
  const taskNotesCommand = buildCodexTaskNotesResourceCommand({
    actionId: context.action.id,
    actionLabel: context.action.label,
    apiBaseUrl: context.apiBaseUrl,
    sessionId: context.sessionId,
    taskId: context.taskId,
    taskNotesPath
  });

  return `## Tasker task notes

Before finishing, write durable findings and next-step context to:

\`${taskNotesPath}\`

Keep the artifact concise and useful for the next agent. Include decisions made,
files inspected or changed, verification performed, and any remaining risks.

After writing the artifact, register it with Tasker:

\`\`\`bash
${taskNotesCommand}
\`\`\`

If artifact registration fails, still finish the task and report the failure.`;
}

export function buildPullRequestRegistrationSection(context: TaskActionPromptContext): string {
  const pullRequestCommand = buildCodexPullRequestResourceCommand({
    apiBaseUrl: context.apiBaseUrl,
    taskId: context.taskId
  });

  return `## Optional pull request resource

If this task does not need a pull request, skip this section.

If you open a pull request while working on this Tasker session, register the PR
URL before finishing:

\`\`\`bash
${pullRequestCommand}
\`\`\`

If PR registration fails, still finish the task and report the failure.`;
}

function buildCodexClaimCommand(apiBaseUrl: string, sessionId: string): string {
  const claimUrl = `${apiBaseUrl}/sessions/${sessionId}/claim`;
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
  actionId,
  actionLabel,
  apiBaseUrl,
  sessionId,
  taskId,
  taskNotesPath
}: {
  readonly actionId: string;
  readonly actionLabel: string;
  readonly apiBaseUrl: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskNotesPath: string;
}): string {
  const artifactUrl = `${apiBaseUrl}/tasks/${taskId}/artifacts`;
  const resourceLabel = `${actionLabel} notes`;

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
  "label": ${JSON.stringify(getArtifactLabelForAction(actionId))},
  "uri": "$notes_path"
}
EOF`;
}

function buildCodexPullRequestResourceCommand({
  apiBaseUrl,
  taskId
}: {
  readonly apiBaseUrl: string;
  readonly taskId: string;
}): string {
  const pullRequestUrl = `${apiBaseUrl}/tasks/${taskId}/pull-requests`;

  return `pr_url="https://github.com/OWNER/REPO/pull/NUMBER"

curl -sS -X POST "${pullRequestUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "url": "$pr_url"
}
EOF`;
}

function getArtifactLabelForAction(
  actionId: string
): "implement" | "other" | "plan" | "research" {
  if (actionId === "research" || actionId === "plan" || actionId === "implement") {
    return actionId;
  }

  return "other";
}
