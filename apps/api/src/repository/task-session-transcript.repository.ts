import type { Kysely } from "kysely";
import type { Database, TaskSessionTranscriptEntryRow } from "../db/schema.js";
import type { TaskSessionId } from "../domain/task-session.js";
import type { TranscriptEntry } from "../domain/transcript-entry.js";

export type TaskSessionTranscriptRepository = {
  readonly append: (
    sessionId: TaskSessionId,
    entry: TranscriptEntry
  ) => Promise<TranscriptEntry>;
  readonly listBySessionId: (
    sessionId: TaskSessionId
  ) => Promise<readonly TranscriptEntry[]>;
};

export class SqliteTaskSessionTranscriptRepository
implements TaskSessionTranscriptRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async append(
    sessionId: TaskSessionId,
    entry: TranscriptEntry
  ): Promise<TranscriptEntry> {
    const row = await this.db
      .insertInto("task_session_transcript_entries")
      .values({
        created_at: entry.createdAt,
        hidden: entry.hidden === true ? 1 : 0,
        id: entry._id,
        kind: entry.kind,
        message_id: entry.messageId ?? null,
        payload_json: JSON.stringify(entry),
        task_session_id: sessionId
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTranscriptEntry(row);
  }

  public async listBySessionId(
    sessionId: TaskSessionId
  ): Promise<readonly TranscriptEntry[]> {
    const rows = await this.db
      .selectFrom("task_session_transcript_entries")
      .selectAll()
      .where("task_session_id", "=", sessionId)
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .execute();

    return rows.map(toTranscriptEntry);
  }
}

function toTranscriptEntry(row: TaskSessionTranscriptEntryRow): TranscriptEntry {
  return JSON.parse(row.payload_json) as TranscriptEntry;
}
