UPDATE task_sessions
SET action_id = 'scope'
WHERE action_id = 'investigate';

UPDATE task_actions
SET
  id = 'scope',
  label = 'Scope',
  icon_name = 'target',
  description = 'Map the relevant codebase surface and work with the user to finalize scope.',
  sort_order = 0,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'investigate'
  AND NOT EXISTS (
    SELECT 1
    FROM task_actions existing
    WHERE existing.id = 'scope'
  );

DELETE FROM task_actions
WHERE id = 'investigate'
  AND label = 'Investigate'
  AND description = 'Inspect the task and produce a concise recommendation.'
  AND EXISTS (
    SELECT 1
    FROM task_actions existing
    WHERE existing.id = 'scope'
  );
