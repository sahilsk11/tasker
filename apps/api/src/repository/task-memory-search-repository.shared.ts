import type { TaskMemorySearchJob } from "../domain/task-memory-search.js";

export type TaskMemorySearchJobRow = {
  readonly attempts: number;
  readonly entity_id: string;
  readonly entity_type: TaskMemorySearchJob["entityType"];
  readonly generation_token: string;
  readonly job_key: string;
  readonly lease_token: string;
  readonly next_chunk: number;
  readonly task_id: string;
};

export function taskMemorySearchJobFromRow(
  row: TaskMemorySearchJobRow
): TaskMemorySearchJob {
  return {
    attempts: row.attempts,
    entityId: row.entity_id,
    entityType: row.entity_type,
    generationToken: row.generation_token,
    key: row.job_key,
    leaseToken: row.lease_token,
    nextChunk: row.next_chunk,
    taskId: row.task_id
  };
}

export function taskMemorySearchSourcePredicate(
  job: TaskMemorySearchJob
): { readonly parameters: readonly string[]; readonly sql: string } {
  switch (job.entityType) {
    case "task":
      return { parameters: [job.entityId], sql: "source_type = 'task_title' AND task_id = ?" };
    case "session":
      return {
        parameters: [job.entityId],
        sql: "source_type = 'session_title' AND session_id = ?"
      };
    case "message":
      return {
        parameters: [job.entityId],
        sql: "source_type = 'message' AND message_id = ?"
      };
  }
}
