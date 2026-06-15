import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LinearService } from "../service/linear.service.js";
import type { TaskService } from "../service/task.service.js";

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

export function registerLinearResolver(
  server: FastifyInstance,
  taskService: TaskService,
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

  server.post("/tasks/:id/linear-ticket", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const input = createLinearIssueSchema.parse(request.body);
    const issue = await linearService.createIssue(input);
    const ticket = await taskService.addTicket(id, {
      externalId: issue.identifier,
      url: issue.url
    });

    return reply.code(201).send({ issue, ticket });
  });
}
