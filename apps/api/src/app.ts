import Fastify from "fastify";
import { resolve } from "node:path";
import { ZodError } from "zod";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { FileTaskActionRepository } from "./repository/task-action.repository.js";
import { SqliteTaskArtifactRepository } from "./repository/task-artifact.repository.js";
import { SqliteTaskPullRequestRepository } from "./repository/task-pull-request.repository.js";
import { SqliteTaskSessionRepository } from "./repository/task-session.repository.js";
import { SqliteTaskTicketRepository } from "./repository/task-ticket.repository.js";
import { SqliteTaskRepository } from "./repository/task.repository.js";
import { SqliteWorkingPathRepository } from "./repository/working-path.repository.js";
import { registerGitHubResolver } from "./resolver/github.resolver.js";
import { registerLinearResolver } from "./resolver/linear.resolver.js";
import { registerTaskBreakdownResolver } from "./resolver/task-breakdown.resolver.js";
import { registerTaskResolver } from "./resolver/task.resolver.js";
import { registerWorkingPathResolver } from "./resolver/working-path.resolver.js";
import { ArtifactStorageService } from "./service/artifact-storage.service.js";
import type { ArtifactStorageOptions } from "./service/artifact-storage.service.js";
import { CodexSessionProvider } from "./service/codex-session-provider.js";
import {
  CursorSessionProvider,
  type CursorSessionProviderOptions
} from "./service/cursor-session-provider.js";
import { BadRequestError, ConflictError, NotFoundError } from "./service/errors.js";
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

export type CreateAppOptions = {
  readonly agentRunProvider?: string | null;
  readonly artifactStorage?: ArtifactStorageOptions;
  readonly codexSessionIndexPath?: string;
  readonly codexSessionsRoot?: string;
  readonly codexStatePath?: string;
  readonly cursor?: CursorSessionProviderOptions;
  readonly databasePath: string;
  readonly github?: GitHubServiceOptions;
  readonly kanna?: KannaSessionProviderOptions;
  readonly linear?: LinearServiceOptions;
  readonly linearApiKey: string | null;
  readonly migrationsDirectory?: string;
  readonly publicApiBaseUrl?: string;
  readonly routePrefix?: string;
  readonly sessionProviders?: readonly TaskSessionProvider[];
  readonly taskActionsPath?: string;
};

export async function createApp(options: CreateAppOptions) {
  migrate({
    databasePath: options.databasePath,
    ...(options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory })
  });

  const db = createDb({ path: options.databasePath });
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
    new CursorSessionProvider(options.cursor),
    ...(options.sessionProviders ?? [])
  ];
  const taskRepository = new SqliteTaskRepository(db);
  const publicApiBaseUrl = options.publicApiBaseUrl ?? "http://127.0.0.1:3000";
  const sessionProviders = new TaskSessionProviderRegistry(providers, {
    defaultLaunchProvider: options.agentRunProvider ?? null
  });
  const workingPathRepository = new SqliteWorkingPathRepository(db);
  const workingPathService = new WorkingPathService(workingPathRepository);
  const taskActionsPath = options.taskActionsPath ?? getDefaultTaskActionsPath();
  const taskEvents = new TaskEventBus();
  const taskStateEventHandler = createTaskStateEventHandler(taskRepository);
  taskEvents.subscribe("artifact_registered", taskStateEventHandler);
  taskEvents.subscribe("pull_request_registered", taskStateEventHandler);
  taskEvents.subscribe("session_claimed", taskStateEventHandler);
  taskEvents.subscribe("session_created", taskStateEventHandler);
  const taskService = new TaskService(
    taskRepository,
    new SqliteTaskArtifactRepository(db),
    new SqliteTaskPullRequestRepository(db),
    new SqliteTaskSessionRepository(db),
    new SqliteTaskTicketRepository(db),
    new FileTaskActionRepository(taskActionsPath),
    publicApiBaseUrl,
    taskEvents,
    sessionProviders,
    new ArtifactStorageService(options.artifactStorage)
  );
  const taskBreakdownService = new TaskBreakdownService(
    taskRepository,
    publicApiBaseUrl
  );
  const linearService = new LinearService(options.linearApiKey, options.linear);
  const githubService = new GitHubService(options.github);

  const server = Fastify({ logger: true });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.code(400).send({ error: error.flatten() });
      return;
    }

    if (error instanceof NotFoundError) {
      void reply.code(404).send({ error: error.message });
      return;
    }

    if (error instanceof BadRequestError) {
      void reply.code(400).send({ error: error.message });
      return;
    }

    if (error instanceof ConflictError) {
      void reply.code(409).send({ error: error.message });
      return;
    }

    void reply.send(error);
  });

  await server.register(
    (api, _options, done) => {
      api.get("/runtime", () => ({
        databasePath: resolve(options.databasePath),
        nodeVersion: process.version,
        ok: true,
        pid: process.pid,
        publicApiBaseUrl,
        service: "tasker-api",
        taskActionsPath: resolve(taskActionsPath),
        uptimeSeconds: Math.round(process.uptime())
      }));

      registerTaskResolver(api, taskService);
      registerTaskBreakdownResolver(api, taskBreakdownService);
      registerWorkingPathResolver(api, workingPathService);
      registerLinearResolver(api, taskService, linearService);
      registerGitHubResolver(api, githubService);
      done();
    },
    { prefix: options.routePrefix ?? "" }
  );

  server.addHook("onClose", async () => {
    await db.destroy();
  });

  return server;
}
