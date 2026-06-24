import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CreateTaskArtifactInput } from "../domain/task-artifact.js";
import type { CreateTaskPullRequestInput } from "../domain/task-pull-request.js";
import type { CreateTaskTicketInput } from "../domain/task-ticket.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const artifactIdParamsSchema = taskIdParamsSchema.extend({
  artifactId: z.string().min(1)
});

const createArtifactSchema = z.object({
  createdBySessionId: z.string().min(1).nullable().optional(),
  label: z.enum(["research", "plan", "implement", "other"]),
  uri: z.string().min(1)
});

const listArtifactsQuerySchema = z.object({
  includeArchived: z
    .enum(["false", "true"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true"))
});

const createPullRequestSchema = z.object({
  url: z.string().url()
});

const createTicketSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url().nullable().default(null)
});

export function registerTaskResourceResolver(
  server: FastifyInstance,
  taskService: TaskService
): void {
  server.get("/tasks/:id/resources", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { resources: await taskService.getResources(id) };
  });

  server.get("/tasks/:id/artifacts", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const { includeArchived } = listArtifactsQuerySchema.parse(request.query);
    return {
      artifacts: await taskService.listArtifacts(id, {
        ...(includeArchived === undefined ? {} : { includeArchived })
      })
    };
  });

  server.get("/tasks/:id/artifacts/:artifactId", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.getArtifact(id, artifactId) };
  });

  server.get("/tasks/:id/artifacts/:artifactId/content", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { content: await taskService.getArtifactContent(id, artifactId) };
  });

  server.post("/tasks/:id/artifacts", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const artifact = await taskService.addArtifact(
      id,
      parseCreateArtifactInput(request.body)
    );
    return reply.code(201).send({ artifact });
  });

  server.post("/tasks/:id/artifacts/:artifactId/archive", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.archiveArtifact(id, artifactId) };
  });

  server.post("/tasks/:id/artifacts/:artifactId/restore", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.restoreArtifact(id, artifactId) };
  });

  server.delete("/tasks/:id/artifacts/:artifactId", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.deleteArtifact(id, artifactId) };
  });

  server.get("/tasks/:id/pull-requests", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { pullRequests: await taskService.listPullRequests(id) };
  });

  server.post("/tasks/:id/pull-requests", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const pullRequest = await taskService.addPullRequest(
      id,
      parseCreatePullRequestInput(request.body)
    );
    return reply.code(201).send({ pullRequest });
  });

  server.get("/tasks/:id/tickets", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { tickets: await taskService.listTickets(id) };
  });

  server.post("/tasks/:id/tickets", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const ticket = await taskService.addTicket(id, parseCreateTicketInput(request.body));
    return reply.code(201).send({ ticket });
  });
}

function parseCreateArtifactInput(body: unknown): CreateTaskArtifactInput {
  const parsed = createArtifactSchema.parse(body);
  return {
    ...(parsed.createdBySessionId !== undefined
      ? { createdBySessionId: parsed.createdBySessionId }
      : {}),
    label: parsed.label,
    uri: parsed.uri
  };
}

function parseCreatePullRequestInput(body: unknown): CreateTaskPullRequestInput {
  return createPullRequestSchema.parse(body);
}

function parseCreateTicketInput(body: unknown): CreateTaskTicketInput {
  const parsed = createTicketSchema.parse(body);
  return {
    externalId: parsed.externalId,
    url: parsed.url
  };
}
