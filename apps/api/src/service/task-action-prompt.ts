import { renderTaskActionTemplate } from "@tasker/core";
import type { TaskActionPromptContext, TaskActionRecord } from "../domain/task-action.js";

export function renderActionPrompt(
  action: TaskActionRecord,
  context: TaskActionPromptContext
): string {
  return renderTaskActionTemplate(action.promptTemplate, {
    ...context,
    action: {
      id: action.id,
      label: action.label
    }
  });
}
