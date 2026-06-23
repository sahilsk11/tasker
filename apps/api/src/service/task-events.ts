import type { TaskEvent } from "../domain/task-event.js";

export type TaskEventType = TaskEvent["type"];

export type TaskEventOf<Type extends TaskEventType> = Extract<
  TaskEvent,
  { readonly type: Type }
>;

export type TaskEventHandler<Type extends TaskEventType> = (
  event: TaskEventOf<Type>
) => Promise<void>;

export class TaskEventBus {
  private readonly handlers = new Map<
    TaskEventType,
    Array<(event: TaskEvent) => Promise<void>>
  >();

  public subscribe<Type extends TaskEventType>(
    type: Type,
    handler: TaskEventHandler<Type>
  ): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push((event) => handler(event as TaskEventOf<Type>));
    this.handlers.set(type, handlers);
  }

  public async publish(event: TaskEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];

    for (const handler of handlers) {
      await handler(event);
    }
  }
}
