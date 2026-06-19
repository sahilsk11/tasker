ALTER TABLE task_actions
ADD COLUMN recommendation_states_json text;

UPDATE task_actions
SET recommendation_states_json = '["ready"]'
WHERE id = 'scope';

UPDATE task_actions
SET recommendation_states_json = '["scoping"]'
WHERE id = 'plan';

UPDATE task_actions
SET recommendation_states_json = '["ready","scoping","planning"]'
WHERE id = 'breakdown';

UPDATE task_actions
SET recommendation_states_json = '["planning"]'
WHERE id = 'implement';

UPDATE task_actions
SET recommendation_states_json = '["implementation"]'
WHERE id = 'code_review';

UPDATE task_actions
SET recommendation_states_json = '[]'
WHERE recommendation_states_json IS NULL;
