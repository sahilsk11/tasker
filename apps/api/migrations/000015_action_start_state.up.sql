ALTER TABLE task_actions
ADD COLUMN start_state text;

UPDATE task_actions
SET start_state = 'scoping'
WHERE id = 'scope';

UPDATE task_actions
SET start_state = 'planning'
WHERE id = 'plan';

UPDATE task_actions
SET start_state = 'planning'
WHERE id = 'breakdown';

UPDATE task_actions
SET start_state = 'implementation'
WHERE id = 'implement';

UPDATE task_actions
SET start_state = 'review'
WHERE id = 'code_review';
