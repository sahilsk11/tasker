CREATE TABLE task_actions (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  prompt_template text NOT NULL,
  options_json text,
  enabled integer NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO task_actions (
  id,
  label,
  description,
  prompt_template,
  options_json,
  enabled,
  sort_order
)
VALUES
  (
    'investigate',
    'Investigate',
    'Inspect the task and produce a concise recommendation.',
    '{{taskHeader}}

## Action
Investigate this task and summarize what should happen next.

{{registerSession}}

{{artifactAttribution}}

{{registerDoc}}

{{registerPr}}',
    NULL,
    1,
    0
  ),
  (
    'plan',
    'Plan',
    'Turn the task into a concrete plan before implementation.',
    '{{taskHeader}}

## Action
Create a practical implementation plan for this task.

{{registerSession}}

{{artifactAttribution}}

{{registerDoc}}

{{registerPr}}',
    NULL,
    1,
    1
  ),
  (
    'breakdown',
    'Break down',
    'Break the task into smaller child tasks or a dependency outline.',
    '{{taskHeader}}

## Action
Break this task down into smaller subtasks and dependencies.

{{registerSession}}

{{artifactAttribution}}

{{registerDoc}}

{{registerPr}}',
    NULL,
    1,
    2
  ),
  (
    'implement',
    'Implement',
    'Start implementing the task from the available context.',
    '{{taskHeader}}

## Action
Implement this task using the current repository context.

{{worktree}}

{{registerSession}}

{{artifactAttribution}}

{{registerDoc}}

{{registerPr}}',
    '{"worktree":{"type":"boolean","label":"Create a worktree","default":false,"fields":{"path":{"type":"text","default":"~/wt"}}}}',
    1,
    3
  ),
  (
    'code_review',
    'Code review',
    'Review the current work and identify issues or missing tests.',
    '{{taskHeader}}

## Action
Review the work attached to this task and call out concrete issues.

{{registerSession}}

{{artifactAttribution}}

{{registerDoc}}

{{registerPr}}',
    NULL,
    1,
    4
  ),
  (
    'new_session',
    'New session',
    'Open a general-purpose agent session attached to this task.',
    '{{taskHeader}}

## Action
Start a new session for this task.

{{registerSession}}

{{artifactAttribution}}

{{registerDoc}}

{{registerPr}}',
    NULL,
    1,
    5
  );

CREATE INDEX task_sessions_action_id_idx ON task_sessions(action_id);
