import Fastify from "fastify";
import { ZodError } from "zod";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { createServerProviders } from "./providers/create-providers.js";
import type { ServerProviderRegistry } from "./providers/registry.js";
import { SqliteTaskArtifactRepository } from "./repository/task-artifact.repository.js";
import { SqliteTaskSessionRepository } from "./repository/task-session.repository.js";
import { SqliteTaskSessionTranscriptRepository } from "./repository/task-session-transcript.repository.js";
import { SqliteTaskTicketRepository } from "./repository/task-ticket.repository.js";
import { SqliteTaskRepository } from "./repository/task.repository.js";
import { registerLinearResolver } from "./resolver/linear.resolver.js";
import { registerTaskResolver } from "./resolver/task.resolver.js";
import { BadRequestError, NotFoundError } from "./service/errors.js";
import { LinearService } from "./service/linear.service.js";
import { TaskSessionCoordinator } from "./service/task-session-coordinator.js";
import { TaskService } from "./service/task.service.js";

export type CreateAppOptions = {
  readonly databasePath: string;
  readonly linearApiKey: string | null;
  readonly providerRegistry?: ServerProviderRegistry;
};

export async function createApp(options: CreateAppOptions) {
  migrate({ databasePath: options.databasePath });

  const db = createDb({ path: options.databasePath });
  const sessionRepository = new SqliteTaskSessionRepository(db);
  const sessionTranscriptRepository = new SqliteTaskSessionTranscriptRepository(db);
  const providerRegistry = options.providerRegistry ?? createServerProviders();
  const taskService = new TaskService(
    new SqliteTaskRepository(db),
    new SqliteTaskArtifactRepository(db),
    sessionRepository,
    sessionTranscriptRepository,
    new SqliteTaskTicketRepository(db)
  );
  const taskSessionCoordinator = new TaskSessionCoordinator(
    sessionRepository,
    sessionTranscriptRepository,
    providerRegistry
  );
  const linearService = new LinearService(options.linearApiKey);

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

  registerTaskResolver(server, taskService, taskSessionCoordinator);
  registerLinearResolver(server, taskService, linearService);

  server.addHook("onClose", async () => {
    for (const provider of providerRegistry.values()) {
      provider.stopAll();
    }
    await db.destroy();
  });

  return server;
}
