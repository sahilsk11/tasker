import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  CreateWorkingDirectoryOptionInput,
  UpdateWorkingDirectoryOptionInput,
  UpdateWorkingPathSettingsInput
} from "../domain/working-paths.js";
import type { WorkingPathService } from "../service/working-path.service.js";

const optionIdParamsSchema = z.object({
  id: z.string().min(1)
});

const updateWorkingPathSettingsSchema = z
  .object({
    defaultWorkingDirectory: z.string().nullable().optional(),
    defaultWorktreePath: z.string().optional()
  })
  .strict();

const createWorkingDirectoryOptionSchema = z
  .object({
    label: z.string().min(1),
    path: z.string().min(1),
    sortOrder: z.number().int().min(0).optional()
  })
  .strict();

const updateWorkingDirectoryOptionSchema = z
  .object({
    label: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    sortOrder: z.number().int().min(0).optional()
  })
  .strict();

export function registerWorkingPathResolver(
  server: FastifyInstance,
  workingPathService: WorkingPathService
): void {
  server.get("/working-paths", async () => workingPathService.getConfig());

  server.patch("/working-paths/settings", async (request) => ({
    settings: await workingPathService.updateSettings(
      parseUpdateWorkingPathSettingsInput(request.body)
    )
  }));

  server.post("/working-paths/options", async (request, reply) => {
    const option = await workingPathService.createOption(
      parseCreateWorkingDirectoryOptionInput(request.body)
    );
    return reply.code(201).send({ option });
  });

  server.patch("/working-paths/options/:id", async (request) => {
    const { id } = optionIdParamsSchema.parse(request.params);
    return {
      option: await workingPathService.updateOption(
        id,
        parseUpdateWorkingDirectoryOptionInput(request.body)
      )
    };
  });

  server.delete("/working-paths/options/:id", async (request, reply) => {
    const { id } = optionIdParamsSchema.parse(request.params);
    await workingPathService.deleteOption(id);
    return reply.code(204).send();
  });
}

function parseUpdateWorkingPathSettingsInput(
  body: unknown
): UpdateWorkingPathSettingsInput {
  const parsed = updateWorkingPathSettingsSchema.parse(body);
  return {
    ...(parsed.defaultWorkingDirectory !== undefined
      ? { defaultWorkingDirectory: parsed.defaultWorkingDirectory }
      : {}),
    ...(parsed.defaultWorktreePath !== undefined
      ? { defaultWorktreePath: parsed.defaultWorktreePath }
      : {})
  };
}

function parseCreateWorkingDirectoryOptionInput(
  body: unknown
): CreateWorkingDirectoryOptionInput {
  const parsed = createWorkingDirectoryOptionSchema.parse(body);
  return {
    label: parsed.label,
    path: parsed.path,
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {})
  };
}

function parseUpdateWorkingDirectoryOptionInput(
  body: unknown
): UpdateWorkingDirectoryOptionInput {
  const parsed = updateWorkingDirectoryOptionSchema.parse(body);
  return {
    ...(parsed.label !== undefined ? { label: parsed.label } : {}),
    ...(parsed.path !== undefined ? { path: parsed.path } : {}),
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {})
  };
}
