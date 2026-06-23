import type { TaskEvent } from "../domain/task-event.js";
import type { TaskRepository } from "../repository/task.repository.js";

type TaskStateEventHandler = (event: TaskEvent) => Promise<void>;

export function createTaskStateEventHandler(
  tasks: TaskRepository
): TaskStateEventHandler {
  return async (event) => {
    switch (event.type) {
      case "artifact_registered":
        switch (event.label) {
          case "implement":
            await tasks.updateStateAtLeast(event.taskId, "implementation");
            return;
          case "other":
            return;
          case "plan":
            await tasks.updateStateAtLeast(event.taskId, "planning");
            return;
          case "research":
            await tasks.updateStateAtLeast(event.taskId, "scoping");
            return;
        }
        return;
      case "pull_request_registered":
        await tasks.updateStateAtLeast(event.taskId, "implementation");
        return;
      case "session_claimed":
      case "session_created":
        return;
    }
  };
}
