import type { TaskAction } from "../domain/task-action.js";
import type { CreateTaskArtifactInput, TaskArtifact } from "../domain/task-artifact.js";
import type {
  ClaimTaskSessionInput,
  CreateTaskSessionInput,
  TaskSession
} from "../domain/task-session.js";
import type { CreateTaskTicketInput, TaskTicket } from "../domain/task-ticket.js";
import type { CreateTaskInput, Task, TaskId, UpdateTaskInput } from "../domain/task.js";
import type { TaskArtifactRepository } from "../repository/task-artifact.repository.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import type { TaskTicketRepository } from "../repository/task-ticket.repository.js";
import type { TaskRepository } from "../repository/task.repository.js";
import {
  defaultCodexSessionsRoot,
  resolveCodexTranscriptPath
} from "./codex-transcript.js";
import { NotFoundError } from "./errors.js";

export type TaskResources = {
  readonly artifacts: readonly TaskArtifact[];
  readonly sessions: readonly TaskSession[];
  readonly tickets: readonly TaskTicket[];
};

export type TaskSessionHandoff = {
  readonly action: TaskAction | null;
  readonly children: readonly Task[];
  readonly latestTaskActivityAt: Date;
  readonly resources: TaskResources;
  readonly task: Task;
};

export type ClaimedTaskSession = {
  readonly handoff: TaskSessionHandoff;
  readonly session: TaskSession;
};

export class TaskService {
  public constructor(
    private readonly tasks: TaskRepository,
    private readonly artifacts: TaskArtifactRepository,
    private readonly sessions: TaskSessionRepository,
    private readonly tickets: TaskTicketRepository,
    private readonly codexSessionsRoot = defaultCodexSessionsRoot()
  ) {}

  public async addArtifact(
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ): Promise<TaskArtifact> {
    return this.addResource(taskId, input);
  }

  public async addResource(
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ): Promise<TaskArtifact> {
    await this.requireTask(taskId);
    return this.artifacts.createForTask(taskId, input);
  }

  public async addSession(
    taskId: TaskId,
    input: CreateTaskSessionInput
  ): Promise<TaskSession> {
    await this.requireTask(taskId);
    return this.sessions.createForTask(taskId, input);
  }

  public async claimSession(
    sessionId: string,
    input: ClaimTaskSessionInput
  ): Promise<ClaimedTaskSession> {
    const claimInput = await this.withDiscoveredTranscript(input);
    const session = await this.sessions.claim(sessionId, claimInput);
    if (session == null) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }

    return {
      handoff: await this.getSessionHandoff(session),
      session
    };
  }

  public async addTicket(
    taskId: TaskId,
    input: CreateTaskTicketInput
  ): Promise<TaskTicket> {
    await this.requireTask(taskId);
    return this.tickets.createForTask(taskId, input);
  }

  public async createTask(input: CreateTaskInput): Promise<Task> {
    if (input.parentTaskId != null) {
      await this.requireTask(input.parentTaskId);
    }

    return this.tasks.create(input);
  }

  public async getResources(taskId: TaskId): Promise<TaskResources> {
    await this.requireTask(taskId);

    const [artifacts, sessions, tickets] = await Promise.all([
      this.artifacts.listByTaskId(taskId),
      this.sessions.listByTaskId(taskId),
      this.tickets.listByTaskId(taskId)
    ]);

    return { artifacts, sessions, tickets };
  }

  public async listActions(taskId: TaskId): Promise<readonly TaskAction[]> {
    await this.requireTask(taskId);
    return defaultTaskActions;
  }

  public async getTask(taskId: TaskId): Promise<Task> {
    return this.requireTask(taskId);
  }

  public async listArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]> {
    await this.requireTask(taskId);
    return this.artifacts.listByTaskId(taskId);
  }

  public async listChildren(taskId: TaskId): Promise<readonly Task[]> {
    await this.requireTask(taskId);
    return this.tasks.findChildren(taskId);
  }

  public async listSessions(taskId: TaskId): Promise<readonly TaskSession[]> {
    await this.requireTask(taskId);
    return this.sessions.listByTaskId(taskId);
  }

  public async listTasks(): Promise<readonly Task[]> {
    return this.tasks.list();
  }

  public async listTickets(taskId: TaskId): Promise<readonly TaskTicket[]> {
    await this.requireTask(taskId);
    return this.tickets.listByTaskId(taskId);
  }

  public async updateTask(taskId: TaskId, input: UpdateTaskInput): Promise<Task> {
    if (input.parentTaskId != null) {
      await this.requireTask(input.parentTaskId);
    }

    const task = await this.tasks.update(taskId, input);
    if (task == null) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    return task;
  }

  private async requireTask(taskId: TaskId): Promise<Task> {
    const task = await this.tasks.findById(taskId);
    if (task == null) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    return task;
  }

  private async getSessionHandoff(session: TaskSession): Promise<TaskSessionHandoff> {
    const [task, resources, children] = await Promise.all([
      this.requireTask(session.taskId),
      this.getResources(session.taskId),
      this.listChildren(session.taskId)
    ]);
    const action =
      defaultTaskActions.find((candidate) => candidate.id === session.actionId) ?? null;

    return {
      action,
      children,
      latestTaskActivityAt: latestDate([
        task.updatedAt,
        ...children.map((child) => child.updatedAt),
        ...resources.artifacts.map((artifact) => artifact.createdAt),
        ...resources.sessions.map((resourceSession) =>
          resourceSession.claimedAt ?? resourceSession.createdAt
        ),
        ...resources.tickets.map((ticket) => ticket.createdAt)
      ]),
      resources,
      task
    };
  }

  private async withDiscoveredTranscript(
    input: ClaimTaskSessionInput
  ): Promise<ClaimTaskSessionInput> {
    if (
      input.provider !== "codex" ||
      input.providerId == null ||
      input.providerId.length === 0 ||
      input.transcriptPath !== undefined
    ) {
      return input;
    }

    const transcriptPath = await resolveCodexTranscriptPath(input.providerId, {
      sessionsRoot: this.codexSessionsRoot
    });

    return transcriptPath == null ? input : { ...input, transcriptPath };
  }
}

function latestDate(values: readonly Date[]): Date {
  return values.reduce((latest, value) =>
    value.getTime() > latest.getTime() ? value : latest
  );
}

const defaultTaskActions = [
  {
    description: "Inspect the task and produce a concise recommendation.",
    id: "investigate",
    isRecommended: true,
    label: "Investigate",
    prompt: "Investigate this task and summarize what should happen next."
  },
  {
    description: "Turn the task into a concrete plan before implementation.",
    id: "plan",
    isRecommended: true,
    label: "Plan",
    prompt: "Create a practical implementation plan for this task."
  },
  {
    description: "Break the task into smaller child tasks or a dependency outline.",
    id: "breakdown",
    isRecommended: false,
    label: "Break down",
    prompt: "Break this task down into smaller subtasks and dependencies."
  },
  {
    description: "Start implementing the task from the available context.",
    id: "implement",
    isRecommended: false,
    label: "Implement",
    prompt: "Implement this task using the current repository context."
  },
  {
    description: "Review the current work and identify issues or missing tests.",
    id: "code_review",
    isRecommended: false,
    label: "Code review",
    prompt: "Review the work attached to this task and call out concrete issues."
  },
  {
    description: "Open a general-purpose agent session attached to this task.",
    id: "new_session",
    isRecommended: false,
    label: "New session",
    prompt: "Start a new session for this task."
  }
] satisfies readonly TaskAction[];
