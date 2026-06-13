import Fastify from "fastify";
import { ZodError } from "zod";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { SqliteTaskArtifactRepository } from "./repository/task-artifact.repository.js";
import { SqliteTaskSessionRepository } from "./repository/task-session.repository.js";
import { SqliteTaskSessionTranscriptRepository } from "./repository/task-session-transcript.repository.js";
import { SqliteTaskTicketRepository } from "./repository/task-ticket.repository.js";
import { SqliteTaskRepository } from "./repository/task.repository.js";
import { registerTaskResolver } from "./resolver/task.resolver.js";
import { NotFoundError } from "./service/errors.js";
import { TaskService } from "./service/task.service.js";

export type CreateAppOptions = {
  readonly databasePath: string;
};

export async function createApp(options: CreateAppOptions) {
  migrate({ databasePath: options.databasePath });

  const db = createDb({ path: options.databasePath });
  const taskService = new TaskService(
    new SqliteTaskRepository(db),
    new SqliteTaskArtifactRepository(db),
    new SqliteTaskSessionRepository(db),
    new SqliteTaskSessionTranscriptRepository(db),
    new SqliteTaskTicketRepository(db)
  );

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

    void reply.send(error);
  });

  registerTaskResolver(server, taskService);

  server.addHook("onClose", async () => {
    await db.destroy();
  });

  return server;
}
