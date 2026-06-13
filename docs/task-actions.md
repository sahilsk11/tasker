# Task Actions

Tasker should treat actions as suggested ways to move a task forward, not as a
hard-coded workflow state machine. A task can have many possible next moves, and
the useful move depends on the task's resources: sessions, artifacts, subtasks,
tickets, worktrees, pull requests, and review state.

## Recommendation

Use three separate concepts:

1. `Task`: the durable object the user cares about.
2. `TaskResource`: durable evidence or handles attached to a task.
3. `TaskAction`: an available command that can create or update resources.

Actions should be generated dynamically from the task and its resources. The UI
can show a small recommended set, while still exposing the full action catalog
from a menu.

```text
task
  resources
    ticket
    session
    artifact
    worktree
    pr
    subtask
  suggested actions
    investigate
    break down
    start work
    review
    merge
```

This keeps the model flexible without making every button bespoke. It also
prevents the task table from becoming a fragile workflow graph.

## Action Model

Each action should have metadata and a handler.

```ts
type TaskAction = {
  id: string;
  label: string;
  description?: string;
  icon: string;
  intent: "primary" | "secondary" | "danger";
  availability: "available" | "disabled" | "hidden";
  reason?: string;
  inputs?: ActionInput[];
};
```

Action handlers should be allowed to produce multiple resource changes. For
example, `investigate` can create a session and later attach an artifact with
the investigation notes. `start_worktree` can create a worktree resource and a
session resource. `break_down` can create an artifact first, then subtasks after
approval.

## Action Runs

Do not only record the final resource. Record action attempts too.

```text
task_action_runs
  id
  task_id
  action_id
  status
  input_json
  output_json
  created_resource_ids
  started_at
  completed_at
```

This gives the product a history like "Investigate ran and produced this doc",
"Break down failed", or "Code review is still running." It also gives running
commands a place to hang cancellation, logs, and progress.

## Suggestions

Use a recommender, not a state machine. The recommender receives the task bundle
and returns ranked actions.

```ts
type TaskActionSuggestion = {
  actionId: string;
  rank: number;
  reason: string;
};
```

The first version can be deterministic rules:

- No sessions and no artifacts: recommend `investigate`.
- Has investigation artifact and no subtasks: recommend `break_down`.
- Has approved breakdown and no worktree: recommend `start_worktree`.
- Has worktree and no active session: recommend `start_work`.
- Has PR artifact: recommend `code_review`.
- Has approved review and open PR: recommend `merge_pr`.
- Has running sessions: recommend `status_update` and `stop_running_commands`.

The important constraint is that these are recommendations. The user can still
open the menu and choose another action.

## Starter Catalog

Ship a small action catalog first:

- `new_session`: start a general agent session for the task.
- `investigate`: start a session with an investigation prompt and attach notes.
- `break_down`: start a session that proposes subtasks or a DAG.
- `create_subtasks`: create child tasks from an approved breakdown artifact.
- `start_worktree`: create a worktree and attach it as a resource.
- `start_work`: start an implementation session in the task worktree.
- `status_update`: ask the active or latest session for a concise update.
- `stop_running_commands`: terminate running commands for active sessions.
- `code_review`: trigger the standard review workflow.
- `merge_pr`: trigger the standard merge workflow when available.

Avoid shipping every imagined action at once. The catalog should be easy to add
to, but the first product loop should focus on task discovery, breakdown, work,
review, and merge.

## UI Shape

Each task card should show:

- One primary recommended action.
- Two or three secondary recommended actions.
- A more menu containing every available action.
- Disabled actions only when the reason teaches the user what is missing.

The action surface should be task-centric. Buttons should not be named after
implementation details unless that detail matters to the user. For example,
`Investigate` is better than `Create Session`, but the action run can still
create a session under the hood.

## Avoid

- Do not encode a single global lifecycle like `new -> investigated -> planned`.
  Real tasks will skip, repeat, or branch.
- Do not make actions purely frontend buttons. The backend should be the source
  of truth for availability and handler routing.
- Do not hide all flexibility behind one "ask agent" text box. That regresses to
  the current manual workflow.
- Do not require every task to have the same next action. Let suggestions guide
  the default path without blocking alternate paths.

## Implementation Path

1. Add a backend action registry that can list actions for a task bundle.
2. Add `task_action_runs` so actions have durable execution history.
3. Implement `new_session`, `investigate`, and `break_down`.
4. Show recommended actions on task cards and the full catalog in the more menu.
5. Add resource-aware recommendations once action runs and artifacts exist.
6. Add higher-risk actions like stop, merge, and destructive cleanup only after
   permissions and confirmation patterns are in place.
