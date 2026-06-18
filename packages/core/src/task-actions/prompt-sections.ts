import type { TaskActionPromptContext } from "./types.js";

export function buildOptionsSection(
  context: Pick<TaskActionPromptContext, "optionsText">
): string {
  return context.optionsText?.trim() ?? "";
}

export function buildTaskTitleSection(
  context: Pick<TaskActionPromptContext, "taskDescription" | "taskTitle">
): string {
  return context.taskTitle;
}

export function buildTaskHeaderSection(
  context: Pick<TaskActionPromptContext, "taskDescription" | "taskTitle">
): string {
  const description = context.taskDescription?.trim();
  if (description == null || description.length === 0) {
    return `# ${context.taskTitle}`;
  }

  return `# ${context.taskTitle}\n\n## Description\n${description}`;
}

export function buildTaskDescriptionSection(
  context: Pick<TaskActionPromptContext, "taskDescription" | "taskTitle">
): string {
  const description = context.taskDescription?.trim();
  if (description == null || description.length === 0) {
    return "";
  }

  return description;
}

export function buildBreakdownWorkflowSection(context: TaskActionPromptContext): string {
  const breakdownPath = `$HOME/.tasker/breakdowns/${context.taskId}/breakdown.json`;
  const validateUrl = `${context.apiBaseUrl}/breakdowns/validate`;
  const acceptUrl = `${context.apiBaseUrl}/breakdowns/accept`;

  return `## Tasker breakdown workflow

Create or update a local breakdown JSON document for this task at:

\`${breakdownPath}\`

Use this schema:

\`\`\`json
{
  "schemaVersion": 1,
  "taskId": ${JSON.stringify(context.taskId)},
  "summary": "Short summary of the decomposition.",
  "items": [
    {
      "id": "backend-contract",
      "title": "Add the backend contract",
      "description": "What this subtask should accomplish.",
      "dependsOn": []
    }
  ]
}
\`\`\`

Keep the breakdown one level deep. Use stable item IDs and put dependency IDs in
\`dependsOn\`. Do not create child tasks directly.

After writing or editing the JSON file, validate it:

\`\`\`bash
breakdown_path="${breakdownPath}"
mkdir -p "$(dirname "$breakdown_path")"

curl -sS -X POST "${validateUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "uri": "$breakdown_path"
}
EOF
\`\`\`

If validation returns \`valid: true\`, give the user the returned \`previewUrl\`.
The user can review that page and accept it to create first-party subtasks.
If validation returns warnings about existing subtasks, adjust the breakdown to
work around them unless the user explicitly asked to append more work.

Only call the accept endpoint yourself if the user explicitly asks you to lock in
the breakdown:

\`\`\`bash
curl -sS -X POST "${acceptUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "uri": "$breakdown_path"
}
EOF
\`\`\``;
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

export function buildArtifactRegistrationSection(context: TaskActionPromptContext): string {
  const artifactCommand = buildCodexArtifactResourceCommand({
    apiBaseUrl: context.apiBaseUrl,
    sessionId: context.sessionId,
    taskId: context.taskId
  });

  return `## Optional artifact registration

If you publish any durable planning, research, design, or implementation artifact,
register it with Tasker before finishing.

Use one of these labels: \`research\`, \`plan\`, \`implement\`, or \`other\`.
Include the current session ID as \`createdBySessionId\`.

Run this command after replacing \`artifact_label\` and \`artifact_uri\`:

\`\`\`bash
${artifactCommand}
\`\`\`

If artifact registration fails, still finish the task and report the failure.`;
}

export function buildArtifactAttributionSection(context: TaskActionPromptContext): string {
  return `## Tasker artifact attribution

When registering artifacts created by this session, include \`"createdBySessionId": "${context.sessionId}"\`
in the artifact resource payload. Tickets and PR resources do not use session
attribution.`;
}

export function buildTaskNotesRegistrationSection(context: TaskActionPromptContext): string {
  return buildArtifactRegistrationSection(context);
}

export function buildLegacyWorktreeSection(context: TaskActionPromptContext): string {
  return buildOptionsSection(context);
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

function buildCodexArtifactResourceCommand({
  apiBaseUrl,
  sessionId,
  taskId
}: {
  readonly apiBaseUrl: string;
  readonly sessionId: string;
  readonly taskId: string;
}): string {
  const artifactUrl = `${apiBaseUrl}/tasks/${taskId}/artifacts`;

  return `artifact_label="other"
artifact_uri="/absolute/path/to/artifact.md"

curl -sS -X POST "${artifactUrl}" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "createdBySessionId": ${JSON.stringify(sessionId)},
  "label": "$artifact_label",
  "uri": "$artifact_uri"
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
