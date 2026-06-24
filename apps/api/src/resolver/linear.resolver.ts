import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LinearTaskService } from "../service/linear-task.service.js";
import type { LinearService } from "../service/linear.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const createLinearIssueSchema = z.object({
  description: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  stateId: z.string().min(1),
  teamId: z.string().min(1),
  title: z.string().min(1)
});

const linearIssueStatusesSchema = z.object({
  identifiers: z.array(z.string().min(1)).max(100)
});

const createTaskFromLinearIssueSchema = z.object({
  identifier: z.string().min(1)
});

export function registerLinearResolver(
  server: FastifyInstance,
  linearTaskService: LinearTaskService,
  linearService: LinearService
): void {
  server.get("/linear/options", async () => ({
    linear: await linearService.getOptions()
  }));

  server.post("/linear/issues/statuses", async (request) => {
    const { identifiers } = linearIssueStatusesSchema.parse(request.body);
    return {
      issues: await linearService.getIssueStatuses(identifiers)
    };
  });

  server.post("/linear/issues/resolve", async (request) => {
    const { identifier } = createTaskFromLinearIssueSchema.parse(request.body);
    return {
      issue: await linearService.getIssue(identifier)
    };
  });

  server.post("/linear/tasks", async (request, reply) => {
    const { identifier } = createTaskFromLinearIssueSchema.parse(request.body);
    const { issue, task, ticket } =
      await linearTaskService.createTaskFromLinearIssue({ identifier });

    return reply.code(201).send({ issue, task, ticket });
  });

  server.post("/tasks/:id/linear-ticket", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const input = createLinearIssueSchema.parse(request.body);
    const { issue, ticket } = await linearTaskService.createLinearIssueForTask(id, input);

    return reply.code(201).send({ issue, ticket });
  });
}
