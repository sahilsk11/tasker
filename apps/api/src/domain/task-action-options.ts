import { z } from "zod";

const taskActionOptionFieldSchema = z.object({
  default: z.string(),
  label: z.string().min(1).optional(),
  type: z.literal("text")
});

const taskActionBooleanOptionSchema = z.object({
  default: z.boolean(),
  fields: z.record(z.string().min(1), taskActionOptionFieldSchema).optional(),
  label: z.string().min(1),
  prompt: z
    .object({
      disabled: z.string().optional(),
      enabled: z.string()
    })
    .optional(),
  type: z.literal("boolean")
});

export const taskActionOptionsSchema = z.record(
  z.string().min(1),
  taskActionBooleanOptionSchema
);

export type TaskActionOptions = z.infer<typeof taskActionOptionsSchema>;

export function parseTaskActionOptions(value: string | null): TaskActionOptions | null {
  if (value == null) {
    return null;
  }

  return taskActionOptionsSchema.parse(normalizeLegacyOptions(JSON.parse(value)));
}

function normalizeLegacyOptions(value: unknown): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([optionId, option]) => [
      optionId,
      normalizeLegacyOption(optionId, option)
    ])
  );
}

function normalizeLegacyOption(optionId: string, option: unknown): unknown {
  if (option == null || typeof option !== "object" || Array.isArray(option)) {
    return option;
  }

  const optionRecord = option as Record<string, unknown>;
  const prompt = optionRecord["prompt"];
  if (optionId !== "worktree" || hasEnabledPrompt(prompt)) {
    return option;
  }

  return {
    ...optionRecord,
    prompt: {
      enabled: buildLegacyWorktreePrompt()
    }
  };
}

function hasEnabledPrompt(prompt: unknown): boolean {
  return (
    prompt != null &&
    typeof prompt === "object" &&
    !Array.isArray(prompt) &&
    "enabled" in prompt
  );
}

function buildLegacyWorktreePrompt(): string {
  return `## Worktree

Before editing files, create an isolated git worktree for this implementation.
Use this location unless it is unavailable:

\`{{path}}\`

Base the worktree on the latest fetched \`origin/main\` or \`origin/master\`, not on
the current checkout's local branch. Leave existing uncommitted changes in the
primary checkout untouched. Do all implementation, verification, commit, push,
and pull request work from inside the worktree.

After creating the worktree, register it with Tasker:

\`\`\`bash
worktree_path="{{path}}"
curl -sS -X POST "{{apiBaseUrl}}/tasks/{{taskId}}/worktrees" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<EOF
{
  "createdBySessionId": "{{sessionId}}",
  "path": "$worktree_path"
}
EOF
\`\`\``;
}
