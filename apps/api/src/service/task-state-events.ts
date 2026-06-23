import type { ArtifactRegisteredTaskEvent } from "../domain/task-event.js";
import type { TaskRepository } from "../repository/task.repository.js";

type ArtifactRegisteredTaskEventHandler = (
  event: ArtifactRegisteredTaskEvent
) => Promise<void>;

export function createTaskStateEventHandler(
  tasks: TaskRepository
): ArtifactRegisteredTaskEventHandler {
  return async (event) => {
    if (event.label === "other") {
      return;
    }

    switch (event.label) {
      case "implement":
        await tasks.updateStateAtLeast(event.taskId, "implementation");
        return;
      case "plan":
        await tasks.updateStateAtLeast(event.taskId, "planning");
        return;
      case "research":
        await tasks.updateStateAtLeast(event.taskId, "scoping");
        return;
    }
  };
}
