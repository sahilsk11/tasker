import { resolve } from "node:path";
import type { Kysely } from "kysely";
import { createDb } from "./db/client.js";
import type { Database } from "./db/schema.js";
import { migrate } from "./db/migrate.js";
import { FileTaskActionRepository } from "./repository/task-action.repository.js";
import { SqliteTaskArtifactRepository } from "./repository/task-artifact.repository.js";
import { SqliteTaskPullRequestRepository } from "./repository/task-pull-request.repository.js";
import { SqliteTaskSessionRepository } from "./repository/task-session.repository.js";
import { SqliteTaskTicketRepository } from "./repository/task-ticket.repository.js";
import { SqliteTaskRepository } from "./repository/task.repository.js";
import { SqliteWorkingPathRepository } from "./repository/working-path.repository.js";
import { ArtifactStorageService } from "./service/artifact-storage.service.js";
import type { ArtifactStorageOptions } from "./service/artifact-storage.service.js";
import { CodexSessionProvider } from "./service/codex-session-provider.js";
import { GitHubService, type GitHubServiceOptions } from "./service/github.service.js";
import {
  KannaSessionProvider,
  type KannaSessionProviderOptions
} from "./service/kanna-session-provider.js";
import { LinearService, type LinearServiceOptions } from "./service/linear.service.js";
import { TaskBreakdownService } from "./service/task-breakdown.service.js";
import {
  TaskSessionProviderRegistry,
  type TaskSessionProvider
} from "./service/session-provider.js";
import { createTaskStateEventHandler } from "./service/task-state-events.js";
import { TaskEventBus } from "./service/task-events.js";
import { TaskService } from "./service/task.service.js";
import { WorkingPathService } from "./service/working-path.service.js";
import { getDefaultTaskActionsPath } from "./task-actions/catalog.js";

export type CreateTaskerRuntimeOptions = {
  readonly agentRunProvider?: string | null;
  readonly artifactStorage?: ArtifactStorageOptions;
  readonly codexSessionIndexPath?: string;
  readonly codexSessionsRoot?: string;
  readonly codexStatePath?: string;
  readonly databasePath: string;
  readonly github?: GitHubServiceOptions;
  readonly kanna?: KannaSessionProviderOptions;
  readonly linear?: LinearServiceOptions;
  readonly linearApiKey: string | null;
  readonly migrationsDirectory?: string;
  readonly publicApiBaseUrl?: string;
  readonly sessionProviders?: readonly TaskSessionProvider[];
  readonly taskActionsPath?: string;
};

export type TaskerRuntimeMetadata = {
  readonly databasePath: string;
  readonly nodeVersion: string;
  readonly ok: true;
  readonly pid: number;
  readonly publicApiBaseUrl: string;
  readonly service: "tasker-api";
  readonly taskActionsPath: string;
  readonly uptimeSeconds: number;
};

export type TaskerRuntimeRepositories = {
  readonly artifact: SqliteTaskArtifactRepository;
  readonly pullRequest: SqliteTaskPullRequestRepository;
  readonly session: SqliteTaskSessionRepository;
  readonly task: SqliteTaskRepository;
  readonly taskAction: FileTaskActionRepository;
  readonly ticket: SqliteTaskTicketRepository;
  readonly workingPath: SqliteWorkingPathRepository;
};

export type TaskerRuntimeServices = {
  readonly github: GitHubService;
  readonly linear: LinearService;
  readonly task: TaskService;
  readonly taskBreakdown: TaskBreakdownService;
  readonly workingPath: WorkingPathService;
};

export type TaskerRuntime = {
  readonly close: () => Promise<void>;
  readonly db: Kysely<Database>;
  readonly metadata: TaskerRuntimeMetadata;
  readonly repositories: TaskerRuntimeRepositories;
  readonly services: TaskerRuntimeServices;
  readonly sessionProviders: TaskSessionProviderRegistry;
  readonly taskEvents: TaskEventBus;
};

export function createTaskerRuntime(
  options: CreateTaskerRuntimeOptions
): TaskerRuntime {
  migrate({
    databasePath: options.databasePath,
    ...(options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory })
  });

  const db = createDb({ path: options.databasePath });
  const publicApiBaseUrl = options.publicApiBaseUrl ?? "http://127.0.0.1:3000";
  const taskActionsPath = options.taskActionsPath ?? getDefaultTaskActionsPath();
  const codexTitleDiscovery =
    options.codexStatePath === undefined || options.codexSessionIndexPath === undefined
      ? undefined
      : {
          sessionIndexPath: options.codexSessionIndexPath,
          statePath: options.codexStatePath
        };
  const providers: TaskSessionProvider[] = [
    new CodexSessionProvider({
      ...(options.codexSessionsRoot === undefined
        ? {}
        : { sessionsRoot: options.codexSessionsRoot }),
      ...(codexTitleDiscovery === undefined
        ? {}
        : { titleDiscovery: codexTitleDiscovery })
    }),
    new KannaSessionProvider(options.kanna),
    ...(options.sessionProviders ?? [])
  ];
  const sessionProviders = new TaskSessionProviderRegistry(providers, {
    defaultLaunchProvider: options.agentRunProvider ?? null
  });

  const repositories: TaskerRuntimeRepositories = {
    artifact: new SqliteTaskArtifactRepository(db),
    pullRequest: new SqliteTaskPullRequestRepository(db),
    session: new SqliteTaskSessionRepository(db),
    task: new SqliteTaskRepository(db),
    taskAction: new FileTaskActionRepository(taskActionsPath),
    ticket: new SqliteTaskTicketRepository(db),
    workingPath: new SqliteWorkingPathRepository(db)
  };
  const taskEvents = new TaskEventBus();
  const taskStateEventHandler = createTaskStateEventHandler(repositories.task);
  taskEvents.subscribe("artifact_registered", taskStateEventHandler);
  taskEvents.subscribe("pull_request_registered", taskStateEventHandler);
  taskEvents.subscribe("session_claimed", taskStateEventHandler);
  taskEvents.subscribe("session_created", taskStateEventHandler);

  const services: TaskerRuntimeServices = {
    github: new GitHubService(options.github),
    linear: new LinearService(options.linearApiKey, options.linear),
    task: new TaskService(
      repositories.task,
      repositories.artifact,
      repositories.pullRequest,
      repositories.session,
      repositories.ticket,
      repositories.taskAction,
      publicApiBaseUrl,
      taskEvents,
      sessionProviders,
      new ArtifactStorageService(options.artifactStorage)
    ),
    taskBreakdown: new TaskBreakdownService(repositories.task, publicApiBaseUrl),
    workingPath: new WorkingPathService(repositories.workingPath)
  };

  let closed = false;

  return {
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await db.destroy();
    },
    db,
    get metadata() {
      return {
        databasePath: resolve(options.databasePath),
        nodeVersion: process.version,
        ok: true as const,
        pid: process.pid,
        publicApiBaseUrl,
        service: "tasker-api" as const,
        taskActionsPath: resolve(taskActionsPath),
        uptimeSeconds: Math.round(process.uptime())
      };
    },
    repositories,
    services,
    sessionProviders,
    taskEvents
  };
}
