import type { Kysely } from "kysely";
import type { Database, LinearStateMappingRow } from "../db/schema.js";
import type {
  LinearStateMapping,
  LinearStateId,
  LinearTeamId,
  UpdateLinearStateMappingsInput
} from "../domain/linear-state-mapping.js";
import type { TaskState } from "../domain/task.js";

export type LinearStateMappingRepository = {
  readonly list: () => Promise<readonly LinearStateMapping[]>;
  readonly listByTeamId: (
    teamId: LinearTeamId
  ) => Promise<readonly LinearStateMapping[]>;
  readonly updateForTeam: (
    input: UpdateLinearStateMappingsInput
  ) => Promise<readonly LinearStateMapping[]>;
};

export class SqliteLinearStateMappingRepository implements LinearStateMappingRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async list(): Promise<readonly LinearStateMapping[]> {
    const rows = await this.db
      .selectFrom("linear_state_mappings")
      .selectAll()
      .orderBy("team_id", "asc")
      .orderBy("task_state", "asc")
      .execute();

    return rows.map(toLinearStateMapping);
  }

  public async listByTeamId(
    teamId: LinearTeamId
  ): Promise<readonly LinearStateMapping[]> {
    const rows = await this.db
      .selectFrom("linear_state_mappings")
      .selectAll()
      .where("team_id", "=", teamId)
      .orderBy("task_state", "asc")
      .execute();

    return rows.map(toLinearStateMapping);
  }

  public async updateForTeam(
    input: UpdateLinearStateMappingsInput
  ): Promise<readonly LinearStateMapping[]> {
    return this.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      const deletes: TaskState[] = [];
      const upserts: Array<{
        readonly created_at: string;
        readonly linear_state_id: LinearStateId;
        readonly task_state: TaskState;
        readonly team_id: LinearTeamId;
        readonly updated_at: string;
      }> = [];

      for (const [taskState, linearStateId] of input.mappings) {
        if (linearStateId == null) {
          deletes.push(taskState);
        } else {
          upserts.push({
            created_at: now,
            linear_state_id: linearStateId,
            task_state: taskState,
            team_id: input.teamId,
            updated_at: now
          });
        }
      }

      if (deletes.length > 0) {
        await trx
          .deleteFrom("linear_state_mappings")
          .where("team_id", "=", input.teamId)
          .where("task_state", "in", deletes)
          .execute();
      }

      if (upserts.length > 0) {
        await trx
          .insertInto("linear_state_mappings")
          .values(upserts)
          .onConflict((oc) => oc.columns(["team_id", "task_state"]).doUpdateSet(
            (eb) => ({
              linear_state_id: eb.ref("excluded.linear_state_id"),
              updated_at: eb.ref("excluded.updated_at")
            })
          ))
          .execute();
      }

      const rows = await trx
        .selectFrom("linear_state_mappings")
        .selectAll()
        .where("team_id", "=", input.teamId)
        .orderBy("task_state", "asc")
        .execute();

      return rows.map(toLinearStateMapping);
    });
  }
}

function toLinearStateMapping(row: LinearStateMappingRow): LinearStateMapping {
  return {
    createdAt: new Date(row.created_at),
    linearStateId: row.linear_state_id,
    taskState: row.task_state,
    teamId: row.team_id,
    updatedAt: new Date(row.updated_at)
  };
}
