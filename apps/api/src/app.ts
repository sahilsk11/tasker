import Fastify from "fastify";
import { ZodError } from "zod";
import { registerGitHubResolver } from "./resolver/github.resolver.js";
import { registerLinearResolver } from "./resolver/linear.resolver.js";
import { registerTaskActionResolver } from "./resolver/task-action.resolver.js";
import { registerTaskBreakdownResolver } from "./resolver/task-breakdown.resolver.js";
import { registerTaskResourceResolver } from "./resolver/task-resource.resolver.js";
import { registerTaskSessionResolver } from "./resolver/task-session.resolver.js";
import { registerTaskResolver } from "./resolver/task.resolver.js";
import { registerWorkingPathResolver } from "./resolver/working-path.resolver.js";
import { BadRequestError, ConflictError, NotFoundError } from "./service/errors.js";
import {
  createTaskerRuntime,
  type CreateTaskerRuntimeOptions
} from "./runtime.js";

export type CreateAppOptions = CreateTaskerRuntimeOptions & {
  readonly routePrefix?: string;
};

export async function createApp(options: CreateAppOptions) {
  const runtime = createTaskerRuntime(options);

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
      api.get("/health", () => ({ ok: true }));
      api.get("/runtime", () => runtime.metadata);

      registerTaskResolver(api, runtime.services.task);
      registerTaskActionResolver(api, runtime.services.task);
      registerTaskBreakdownResolver(api, runtime.services.taskBreakdown);
      registerTaskResourceResolver(api, runtime.services.task);
      registerTaskSessionResolver(api, runtime.services.task);
      registerWorkingPathResolver(api, runtime.services.workingPath);
      registerLinearResolver(api, runtime.services.linearTask, runtime.services.linear);
      registerGitHubResolver(api, runtime.services.github);
      done();
    },
    { prefix: options.routePrefix ?? "" }
  );

  server.addHook("onClose", async () => {
    await runtime.close();
  });

  return server;
}
