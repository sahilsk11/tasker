import { stat, readFile } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { TaskAction } from "../domain/task-action.js";
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
import { resolveWorktreeForPrompt } from "../domain/task-action-prompt-values.js";
import type { CreateTaskTicketInput, TaskTicket } from "../domain/task-ticket.js";
import type { CreateTaskInput, Task, TaskId, UpdateTaskInput } from "../domain/task.js";
import type { TaskArtifactRepository } from "../repository/task-artifact.repository.js";
import type { TaskPullRequestRepository } from "../repository/task-pull-request.repository.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import type { TaskTicketRepository } from "../repository/task-ticket.repository.js";
import type { TaskActionRepository } from "../repository/task-action.repository.js";
import { toTaskAction } from "../repository/task-action.repository.js";
import type { TaskRepository } from "../repository/task.repository.js";
import {
  defaultCodexSessionsRoot,
  resolveCodexTranscriptPath
} from "./codex-transcript.js";
import { BadRequestError, NotFoundError } from "./errors.js";
import { renderActionPrompt } from "./task-action-prompt.js";

export type CreateTaskSessionResult = {
  readonly prompt: string | null;
  readonly session: TaskSession;
};

export type TaskResources = {
  readonly artifacts: readonly TaskArtifact[];
  readonly pullRequests: readonly TaskPullRequest[];
  readonly sessions: readonly TaskSession[];
  readonly tickets: readonly TaskTicket[];
};

export type TaskOverview = {
  readonly action: TaskAction | null;
  readonly children: readonly Task[];
  readonly latestTaskActivityAt: Date;
  readonly resources: TaskResources;
  readonly task: Task;
};

export type ClaimTaskSessionResult = {
  readonly taskOverview: TaskOverview;
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
    private readonly codexSessionsRoot = defaultCodexSessionsRoot()
  ) {}

  public async addArtifact(
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ): Promise<TaskArtifact> {
    await this.requireTask(taskId);
    await this.requireSessionForTask(taskId, input.createdBySessionId);
    const artifact = await this.artifacts.createForTask(taskId, input);
    await this.inferTaskStateFromArtifact(taskId, artifact);
    return artifact;
  }

  public async addPullRequest(
    taskId: TaskId,
    input: CreateTaskPullRequestInput
  ): Promise<TaskPullRequest> {
    await this.requireTask(taskId);
    const pullRequest = await this.pullRequests.createForTask(taskId, input);
    await this.tasks.updateStateAtLeast(taskId, "code_review");
    return pullRequest;
  }

  public async addSession(
    taskId: TaskId,
    input: CreateTaskSessionInput
  ): Promise<CreateTaskSessionResult> {
    await this.requireTask(taskId);
    if (input.actionId != null) {
      await this.requireEnabledAction(input.actionId);
    }
    const session = await this.sessions.createForTask(taskId, input);
    const prompt =
      session.actionId == null
        ? null
        : await this.renderSessionPrompt(taskId, session.id, input.options);

    return { prompt, session };
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
    const worktree = resolveWorktreeForPrompt(action.options, options);

    return renderActionPrompt(action, {
      action: {
        id: action.id,
        label: action.label
      },
      apiBaseUrl: this.publicApiBaseUrl,
      sessionId,
      taskDescription: task.description,
      taskId,
      taskTitle: task.title,
      ...(worktree === undefined ? {} : { worktree })
    });
  }

  public async claimSession(
    sessionId: string,
    input: ClaimTaskSessionInput
  ): Promise<ClaimTaskSessionResult> {
    const claimInput = await this.withDiscoveredTranscript(input);
    const session = await this.sessions.claim(sessionId, claimInput);
    if (session == null) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }

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

  public async createTask(input: CreateTaskInput): Promise<Task> {
    if (input.parentTaskId != null) {
      await this.requireTask(input.parentTaskId);
    }

    return this.tasks.create(input);
  }

  public async getResources(taskId: TaskId): Promise<TaskResources> {
    await this.requireTask(taskId);

    const [artifacts, pullRequests, sessions, tickets] = await Promise.all([
      this.artifacts.listByTaskId(taskId),
      this.pullRequests.listByTaskId(taskId),
      this.sessions.listByTaskId(taskId),
      this.tickets.listByTaskId(taskId)
    ]);

    return { artifacts, pullRequests, sessions, tickets };
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

  public async listActions(taskId: TaskId): Promise<readonly TaskAction[]> {
    await this.requireTask(taskId);
    const records = await this.actions.listEnabled();
    return records.map(toTaskAction);
  }

  public async getTask(taskId: TaskId): Promise<Task> {
    return this.requireTask(taskId);
  }

  public async listArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]> {
    await this.requireTask(taskId);
    return this.artifacts.listByTaskId(taskId);
  }

  public async listPullRequests(taskId: TaskId): Promise<readonly TaskPullRequest[]> {
    await this.requireTask(taskId);
    return this.pullRequests.listByTaskId(taskId);
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
      this.requireTask(session.taskId),
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

  private async inferTaskStateFromArtifact(
    taskId: TaskId,
    artifact: TaskArtifact
  ): Promise<void> {
    if (artifact.label === "other") {
      return;
    }

    await this.tasks.updateStateAtLeast(taskId, artifact.label);
  }
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
