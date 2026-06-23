import { stat, readFile } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  TaskAction,
  TaskActionDetails,
  UpdateTaskActionInput
} from "../domain/task-action.js";
import type { CreateTaskArtifactInput, TaskArtifact } from "../domain/task-artifact.js";
import type {
  CreateTaskPullRequestInput,
  TaskPullRequest
} from "../domain/task-pull-request.js";
import type {
  ClaimTaskSessionInput,
  CreateTaskSessionInput,
  TaskSession
} from "../domain/task-session.js";
import type { TaskActionPromptValues } from "../domain/task-action-prompt-values.js";
import {
  resolveWorkingPathForPrompt,
  renderOptionsForPrompt
} from "../domain/task-action-prompt-values.js";
import type { CreateTaskTicketInput, TaskTicket } from "../domain/task-ticket.js";
import type {
  CreateTaskInput,
  Task,
  TaskId,
  TaskWithDependencyState,
  UpdateTaskInput
} from "../domain/task.js";
import type { TaskArtifactRepository } from "../repository/task-artifact.repository.js";
import type { TaskPullRequestRepository } from "../repository/task-pull-request.repository.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import type { TaskTicketRepository } from "../repository/task-ticket.repository.js";
import type { TaskActionRepository } from "../repository/task-action.repository.js";
import {
  toTaskAction,
  toTaskActionDetails
} from "../repository/task-action.repository.js";
import type { TaskRepository } from "../repository/task.repository.js";
import { BadRequestError, ConflictError, NotFoundError } from "./errors.js";
import { ArtifactStorageService } from "./artifact-storage.service.js";
import {
  TaskSessionProviderRegistry,
  type StartedTaskSession
} from "./session-provider.js";
import { renderActionPrompt } from "./task-action-prompt.js";
import type { TaskEventBus } from "./task-events.js";
import { normalizeOptionalDirectoryPath } from "./working-directory.js";

export type TaskResources = {
  readonly artifacts: readonly TaskArtifact[];
  readonly pullRequests: readonly TaskPullRequest[];
  readonly sessions: readonly TaskSession[];
  readonly tickets: readonly TaskTicket[];
};

export type ListTasksInput = {
  readonly parentTaskId: TaskId | null;
};

export type TaskOverview = {
  readonly action: TaskAction | null;
  readonly children: readonly TaskWithDependencyState[];
  readonly latestTaskActivityAt: Date;
  readonly resources: TaskResources;
  readonly task: TaskWithDependencyState;
};

export type ClaimTaskSessionResult = {
  readonly taskOverview: TaskOverview;
  readonly session: TaskSession;
};

export type RunTaskSessionPromptInput = {
  readonly prompt: string;
  readonly provider?: string | null;
  readonly workingPath: string;
};

export type RunTaskSessionPromptResult = {
  readonly launch: StartedTaskSession["launch"];
  readonly session: TaskSession;
};

export type ArtifactContentKind = "html" | "image" | "markdown" | "unsupported";

export type ArtifactContent = {
  readonly artifact: TaskArtifact;
  readonly content: string | null;
  readonly contentType: string;
  readonly encoding: "base64" | "utf8" | null;
  readonly fileName: string;
  readonly kind: ArtifactContentKind;
  readonly sizeBytes: number;
};

const maxTextArtifactBytes = 1024 * 1024;
const maxBinaryArtifactBytes = 10 * 1024 * 1024;

export class TaskService {
  public constructor(
    private readonly tasks: TaskRepository,
    private readonly artifacts: TaskArtifactRepository,
    private readonly pullRequests: TaskPullRequestRepository,
    private readonly sessions: TaskSessionRepository,
    private readonly tickets: TaskTicketRepository,
    private readonly actions: TaskActionRepository,
    private readonly publicApiBaseUrl: string,
    private readonly events: TaskEventBus,
    private readonly sessionProviders = new TaskSessionProviderRegistry(),
    private readonly artifactStorage = new ArtifactStorageService()
  ) {}

  public async addArtifact(
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ): Promise<TaskArtifact> {
    await this.requireTask(taskId);
    await this.requireSessionForTask(taskId, input.createdBySessionId);
    const artifact = await this.artifacts.createForTask(taskId, input);
    await this.events.publish({
      type: "artifact_registered",
      artifactId: artifact.id,
      createdBySessionId: artifact.createdBySessionId,
      label: artifact.label,
      taskId,
      uri: artifact.uri
    });
    return artifact;
  }

  public async addPullRequest(
    taskId: TaskId,
    input: CreateTaskPullRequestInput
  ): Promise<TaskPullRequest> {
    await this.requireTask(taskId);
    const pullRequest = await this.pullRequests.createForTask(taskId, input);
    await this.events.publish({
      type: "pull_request_registered",
      pullRequestId: pullRequest.id,
      taskId,
      url: pullRequest.url
    });
    return pullRequest;
  }

  public async addSession(
    taskId: TaskId,
    input: CreateTaskSessionInput
  ): Promise<TaskSession> {
    await this.requireTask(taskId);
    if (input.actionId != null) {
      await this.requireEnabledAction(input.actionId);
    }
    const session = await this.sessionProviders.enrichSession(
      await this.sessions.createForTask(taskId, input)
    );
    await this.events.publish({
      type: "session_created",
      actionId: session.actionId,
      sessionId: session.id,
      taskId
    });
    return session;
  }

  public async renderSessionPrompt(
    taskId: TaskId,
    sessionId: string,
    options?: TaskActionPromptValues
  ): Promise<string> {
    await this.requireTask(taskId);
    const session = await this.sessions.findById(sessionId);
    if (session?.taskId !== taskId) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }

    if (session.actionId == null) {
      throw new BadRequestError(`Task session ${sessionId} has no action`);
    }

    const action = await this.actions.findById(session.actionId);
    if (action == null) {
      throw new BadRequestError(`Task action ${session.actionId} not found`);
    }

    const task = await this.requireTask(taskId);
    const optionsText = renderOptionsForPrompt(action.options, options);
    const workingPath = resolveWorkingPathForPrompt(options);
    const basePrompt = renderActionPrompt(action, {
      action: {
        id: action.id,
        label: action.label
      },
      apiBaseUrl: this.publicApiBaseUrl,
      sessionId,
      taskDescription: task.description,
      taskId,
      taskTitle: task.title,
      ...(optionsText === undefined ? {} : { optionsText })
    });

    return workingPath === undefined
      ? basePrompt
      : `${basePrompt}\n\n## Working path\n\nStart from this working directory:\n\n\`${workingPath}\``;
  }

  public async runSessionPrompt(
    taskId: TaskId,
    sessionId: string,
    input: RunTaskSessionPromptInput
  ): Promise<RunTaskSessionPromptResult> {
    const prompt = input.prompt.trim();
    if (prompt.length === 0) {
      throw new BadRequestError("Prompt is required");
    }
    const workingPath = input.workingPath.trim();
    if (workingPath.length === 0) {
      throw new BadRequestError("Working path is required");
    }

    const task = await this.requireTask(taskId);
    const session = await this.sessions.findById(sessionId);
    if (session?.taskId !== taskId) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }
    if (session.claimedAt != null) {
      throw new BadRequestError(`Task session ${sessionId} has already been claimed`);
    }

    const started = await this.sessionProviders.startSession({
      prompt,
      ...(input.provider !== undefined ? { requestedProvider: input.provider } : {}),
      session,
      task,
      workingPath
    });

    return {
      launch: started.launch,
      session: await this.sessionProviders.enrichSession(session)
    };
  }

  public async claimSession(
    sessionId: string,
    input: ClaimTaskSessionInput
  ): Promise<ClaimTaskSessionResult> {
    const claimInput = await this.sessionProviders.prepareClaimInput(input);
    const claimedSession = await this.sessions.claim(sessionId, claimInput);
    const session =
      claimedSession == null
        ? null
        : await this.sessionProviders.enrichSession(claimedSession);
    if (session == null) {
      const existingSession = await this.sessions.findById(sessionId);
      if (existingSession?.claimedAt != null) {
        throw new ConflictError(`Task session ${sessionId} has already been claimed`);
      }

      throw new NotFoundError(`Task session ${sessionId} not found`);
    }

    await this.events.publish({
      type: "session_claimed",
      actionId: session.actionId,
      sessionId: session.id,
      taskId: session.taskId
    });

    return {
      taskOverview: await this.getTaskOverview(session),
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

  public async createTask(input: CreateTaskInput): Promise<TaskWithDependencyState> {
    if (input.parentTaskId != null) {
      await this.requireTask(input.parentTaskId);
    }

    return withWaitingDependencies(
      await this.tasks.create({
        ...input,
        ...(input.workingDirectory !== undefined
          ? {
              workingDirectory: await normalizeOptionalDirectoryPath(
                input.workingDirectory,
                "Working directory"
              )
            }
          : {})
      }),
      []
    );
  }

  public async getResources(taskId: TaskId): Promise<TaskResources> {
    await this.requireTask(taskId);

    const [artifacts, pullRequests, sessions, tickets] = await Promise.all([
      this.artifacts.listByTaskId(taskId),
      this.pullRequests.listByTaskId(taskId),
      this.sessions.listByTaskId(taskId),
      this.tickets.listByTaskId(taskId)
    ]);

    return {
      artifacts,
      pullRequests,
      sessions: await this.sessionProviders.enrichSessions(sessions),
      tickets
    };
  }

  public async getArtifact(
    taskId: TaskId,
    artifactId: string
  ): Promise<TaskArtifact> {
    await this.requireTask(taskId);
    const artifact = await this.artifacts.findByTaskIdAndId(taskId, artifactId);
    if (artifact == null) {
      throw new NotFoundError(`Task artifact ${artifactId} not found`);
    }

    return artifact;
  }

  public async getArtifactContent(
    taskId: TaskId,
    artifactId: string
  ): Promise<ArtifactContent> {
    const artifact = await this.getArtifact(taskId, artifactId);
    const filePath = getLocalArtifactPath(artifact.uri);
    const fileStat = await stat(filePath).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new NotFoundError(`Artifact file not found: ${artifact.uri}`);
      }

      throw error;
    });

    if (!fileStat.isFile()) {
      throw new BadRequestError("Artifact URI must reference a file");
    }

    const fileName = basename(filePath);
    const fileKind = getArtifactContentKind(fileName);
    const contentType = getArtifactContentType(fileName);

    if (fileKind === "unsupported") {
      return {
        artifact,
        content: null,
        contentType,
        encoding: null,
        fileName,
        kind: fileKind,
        sizeBytes: fileStat.size
      };
    }

    const maxBytes = fileKind === "image" ? maxBinaryArtifactBytes : maxTextArtifactBytes;
    if (fileStat.size > maxBytes) {
      throw new BadRequestError(
        `Artifact file is too large to render (${String(fileStat.size)} bytes)`
      );
    }

    const buffer = await readFile(filePath);
    const encoding = fileKind === "image" ? "base64" : "utf8";

    return {
      artifact,
      content: buffer.toString(encoding),
      contentType,
      encoding,
      fileName,
      kind: fileKind,
      sizeBytes: fileStat.size
    };
  }

  public async archiveArtifact(
    taskId: TaskId,
    artifactId: string
  ): Promise<TaskArtifact> {
    const artifact = await this.getArtifact(taskId, artifactId);
    if (artifact.archivedAt != null) {
      throw new BadRequestError(`Task artifact ${artifactId} is already archived`);
    }

    const uri = await this.artifactStorage.archive(artifact);
    const archived = await this.artifacts.archive(taskId, artifactId, { uri });
    if (archived == null) {
      throw new NotFoundError(`Task artifact ${artifactId} not found`);
    }

    return archived;
  }

  public async restoreArtifact(
    taskId: TaskId,
    artifactId: string
  ): Promise<TaskArtifact> {
    const artifact = await this.getArtifact(taskId, artifactId);
    if (artifact.archivedAt == null) {
      throw new BadRequestError(`Task artifact ${artifactId} is not archived`);
    }

    const uri = await this.artifactStorage.restore(artifact);
    const restored = await this.artifacts.restore(taskId, artifactId, { uri });
    if (restored == null) {
      throw new NotFoundError(`Task artifact ${artifactId} not found`);
    }

    return restored;
  }

  public async deleteArtifact(
    taskId: TaskId,
    artifactId: string
  ): Promise<TaskArtifact> {
    const artifact = await this.getArtifact(taskId, artifactId);
    await this.artifactStorage.delete(artifact);
    const deleted = await this.artifacts.deleteByTaskIdAndId(taskId, artifactId);
    if (deleted == null) {
      throw new NotFoundError(`Task artifact ${artifactId} not found`);
    }

    return deleted;
  }

  public async listActions(taskId: TaskId): Promise<readonly TaskAction[]> {
    const task = await this.requireTask(taskId);
    const records = await this.actions.listEnabled();
    return records.map((record) =>
      toTaskAction({
        ...record,
        isRecommended: record.recommendationStates.includes(task.state)
      })
    );
  }

  public async listActionSettings(): Promise<readonly TaskActionDetails[]> {
    const records = await this.actions.listAll();
    return records.map(toTaskActionDetails);
  }

  public async getTask(taskId: TaskId): Promise<TaskWithDependencyState> {
    return this.addDependencyState(await this.requireTask(taskId));
  }

  public async listArtifacts(
    taskId: TaskId,
    options: { readonly includeArchived?: boolean } = {}
  ): Promise<readonly TaskArtifact[]> {
    await this.requireTask(taskId);
    return this.artifacts.listByTaskId(taskId, options);
  }

  public async listPullRequests(taskId: TaskId): Promise<readonly TaskPullRequest[]> {
    await this.requireTask(taskId);
    return this.pullRequests.listByTaskId(taskId);
  }

  public async listChildren(taskId: TaskId): Promise<readonly TaskWithDependencyState[]> {
    await this.requireTask(taskId);
    return this.addDependencyStates(await this.tasks.findChildren(taskId));
  }

  public async listSessions(taskId: TaskId): Promise<readonly TaskSession[]> {
    await this.requireTask(taskId);
    return this.sessionProviders.enrichSessions(
      await this.sessions.listByTaskId(taskId)
    );
  }

  public async listTasks(input: ListTasksInput): Promise<readonly TaskWithDependencyState[]> {
    if (input.parentTaskId != null) {
      await this.requireTask(input.parentTaskId);
    }

    return this.addDependencyStates(
      await this.tasks.listByParentTaskId(input.parentTaskId)
    );
  }

  public async listTickets(taskId: TaskId): Promise<readonly TaskTicket[]> {
    await this.requireTask(taskId);
    return this.tickets.listByTaskId(taskId);
  }

  public async updateTask(
    taskId: TaskId,
    input: UpdateTaskInput
  ): Promise<TaskWithDependencyState> {
    if (input.parentTaskId != null) {
      await this.requireTask(input.parentTaskId);
    }

    const task = await this.tasks.update(taskId, {
      ...input,
      ...(input.workingDirectory !== undefined
        ? {
            workingDirectory: await normalizeOptionalDirectoryPath(
              input.workingDirectory,
              "Working directory"
            )
          }
        : {})
    });
    if (task == null) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    return this.addDependencyState(task);
  }

  public async updateActionSettings(
    actionId: string,
    input: UpdateTaskActionInput
  ): Promise<TaskActionDetails> {
    const action = await this.actions.update(actionId, input);
    if (action == null) {
      throw new NotFoundError(`Task action ${actionId} not found`);
    }

    return toTaskActionDetails(action);
  }

  private async requireTask(taskId: TaskId): Promise<Task> {
    const task = await this.tasks.findById(taskId);
    if (task == null) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    return task;
  }

  private async requireSessionForTask(
    taskId: TaskId,
    sessionId: string | null | undefined
  ): Promise<void> {
    if (sessionId == null) {
      return;
    }

    const session = await this.sessions.findById(sessionId);
    if (session?.taskId !== taskId) {
      throw new BadRequestError(`Task session ${sessionId} does not belong to task ${taskId}`);
    }
  }

  private async requireEnabledAction(actionId: string): Promise<void> {
    const action = await this.actions.findById(actionId);
    if (action == null) {
      throw new BadRequestError(`Task action ${actionId} not found`);
    }
  }

  private async getTaskOverview(session: TaskSession): Promise<TaskOverview> {
    const [task, resources, children] = await Promise.all([
      this.getTask(session.taskId),
      this.getResources(session.taskId),
      this.listChildren(session.taskId)
    ]);
    const action =
      session.actionId == null ? null : await this.actions.findById(session.actionId);

    return {
      action: action == null ? null : toTaskAction(action),
      children,
      latestTaskActivityAt: latestDate([
        task.updatedAt,
        ...children.map((child) => child.updatedAt),
        ...resources.artifacts.map((artifact) => artifact.createdAt),
        ...resources.pullRequests.map((pullRequest) => pullRequest.createdAt),
        ...resources.sessions.map((resourceSession) =>
          resourceSession.claimedAt ?? resourceSession.createdAt
        ),
        ...resources.tickets.map((ticket) => ticket.createdAt)
      ]),
      resources,
      task
    };
  }

  private async addDependencyState(task: Task): Promise<TaskWithDependencyState> {
    const [dependencyState] = await this.tasks.listWaitingDependenciesByTaskIds([
      task.id
    ]);
    return withWaitingDependencies(
      task,
      dependencyState?.waitingDependencies ?? []
    );
  }

  private async addDependencyStates(
    tasks: readonly Task[]
  ): Promise<readonly TaskWithDependencyState[]> {
    const dependencyStates = await this.tasks.listWaitingDependenciesByTaskIds(
      tasks.map((task) => task.id)
    );
    const dependenciesByTaskId = new Map(
      dependencyStates.map((state) => [state.taskId, state.waitingDependencies])
    );

    return tasks.map((task) =>
      withWaitingDependencies(task, dependenciesByTaskId.get(task.id) ?? [])
    );
  }

}

function withWaitingDependencies(
  task: Task,
  waitingDependencies: TaskWithDependencyState["waitingDependencies"]
): TaskWithDependencyState {
  return {
    ...task,
    waitingDependencies
  };
}

function getLocalArtifactPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }

  if (isAbsolute(uri)) {
    return uri;
  }

  throw new BadRequestError("Only local artifact file paths can be rendered");
}

function getArtifactContentKind(fileName: string): ArtifactContentKind {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }

  if (extension === ".html" || extension === ".htm") {
    return "html";
  }

  if ([".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension)) {
    return "image";
  }

  return "unsupported";
}

function getArtifactContentType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".gif": "image/gif",
    ".htm": "text/html; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".markdown": "text/markdown; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  };

  return contentTypes[extension] ?? "application/octet-stream";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function latestDate(values: readonly Date[]): Date {
  return values.reduce((latest, value) =>
    value.getTime() > latest.getTime() ? value : latest
  );
}
