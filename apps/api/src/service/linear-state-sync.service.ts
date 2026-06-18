import type { TaskState, TaskId } from "../domain/task.js";
import type { LinearStateMappingRepository } from "../repository/linear-state-mapping.repository.js";
import type { TaskTicketRepository } from "../repository/task-ticket.repository.js";
import type { LinearIssueStatus, LinearService } from "./linear.service.js";

export type LinearStateSyncLogger = {
  readonly warn: (details: object, message: string) => void;
};

export type LinearStateSyncServiceOptions = {
  readonly logger?: LinearStateSyncLogger;
};

export class LinearStateSyncService {
  private readonly logger: LinearStateSyncLogger;

  public constructor(
    private readonly linear: LinearService,
    private readonly mappings: LinearStateMappingRepository,
    private readonly tickets: TaskTicketRepository,
    options: LinearStateSyncServiceOptions = {}
  ) {
    this.logger = options.logger ?? {
      warn: () => {
        // Logging is optional for tests and non-server callers.
      }
    };
  }

  public async syncTaskState(taskId: TaskId, taskState: TaskState): Promise<void> {
    try {
      const tickets = await this.tickets.listByTaskId(taskId);
      const identifiers = tickets.flatMap((ticket) => [
        ticket.externalId,
        ...(ticket.url == null ? [] : [ticket.url])
      ]);

      if (identifiers.length === 0) {
        return;
      }

      const [issues, mappings] = await Promise.all([
        this.linear.getIssueStatuses(identifiers),
        this.mappings.list()
      ]);
      const mappingByTeamAndTaskState = new Map(
        mappings.map((mapping) => [
          getMappingKey(mapping.teamId, mapping.taskState),
          mapping.linearStateId
        ])
      );

      await Promise.all(
        issues.map((issue) =>
          this.syncIssueState(issue, taskState, mappingByTeamAndTaskState)
        )
      );
    } catch (error) {
      this.logger.warn(
        { error, taskId, taskState },
        "Failed to sync Tasker state to Linear"
      );
    }
  }

  private async syncIssueState(
    issue: LinearIssueStatus,
    taskState: TaskState,
    mappingByTeamAndTaskState: ReadonlyMap<string, string>
  ): Promise<void> {
    const stateId = mappingByTeamAndTaskState.get(
      getMappingKey(issue.state.team.id, taskState)
    );
    if (stateId == null || issue.state.id === stateId) {
      return;
    }

    try {
      await this.linear.updateIssueState({
        issueId: issue.id,
        stateId
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          issueId: issue.id,
          linearIdentifier: issue.identifier,
          stateId,
          taskState
        },
        "Failed to update Linear issue state"
      );
    }
  }
}

function getMappingKey(teamId: string, taskState: TaskState): string {
  return `${teamId}:${taskState}`;
}
