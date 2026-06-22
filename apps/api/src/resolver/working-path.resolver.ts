import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UpdateWorkingPathSettingsInput } from "../domain/working-paths.js";
import type { WorkingPathService } from "../service/working-path.service.js";

const updateWorkingPathSettingsSchema = z
  .object({
    defaultWorkingDirectory: z.string().nullable().optional(),
    defaultWorktreePath: z.string().optional(),
    generatedUrlMode: z.enum(["localhost", "public"]).optional(),
    publicAppBaseUrl: z.string().nullable().optional()
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
      : {}),
    ...(parsed.generatedUrlMode !== undefined
      ? { generatedUrlMode: parsed.generatedUrlMode }
      : {}),
    ...(parsed.publicAppBaseUrl !== undefined
      ? { publicAppBaseUrl: parsed.publicAppBaseUrl }
      : {})
  };
}
