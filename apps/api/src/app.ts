import Fastify from "fastify";
import { ZodError } from "zod";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { SqliteTaskArtifactRepository } from "./repository/task-artifact.repository.js";
import { SqliteTaskSessionRepository } from "./repository/task-session.repository.js";
import { SqliteTaskTicketRepository } from "./repository/task-ticket.repository.js";
import { SqliteTaskRepository } from "./repository/task.repository.js";
import { registerGitHubResolver } from "./resolver/github.resolver.js";
import { registerLinearResolver } from "./resolver/linear.resolver.js";
import { registerTaskResolver } from "./resolver/task.resolver.js";
import { BadRequestError, NotFoundError } from "./service/errors.js";
import { GitHubService, type GitHubServiceOptions } from "./service/github.service.js";
import { LinearService, type LinearServiceOptions } from "./service/linear.service.js";
import { TaskService } from "./service/task.service.js";

export type CreateAppOptions = {
  readonly codexSessionsRoot?: string;
  readonly databasePath: string;
  readonly github?: GitHubServiceOptions;
  readonly linear?: LinearServiceOptions;
  readonly linearApiKey: string | null;
};

export async function createApp(options: CreateAppOptions) {
  migrate({ databasePath: options.databasePath });

  const db = createDb({ path: options.databasePath });
  const taskService = new TaskService(
    new SqliteTaskRepository(db),
    new SqliteTaskArtifactRepository(db),
    new SqliteTaskSessionRepository(db),
    new SqliteTaskTicketRepository(db),
    options.codexSessionsRoot
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

    void reply.send(error);
  });

  registerTaskResolver(server, taskService);
  registerLinearResolver(server, taskService, linearService);
  registerGitHubResolver(server, githubService);

  server.addHook("onClose", async () => {
    await db.destroy();
  });

  return server;
}
