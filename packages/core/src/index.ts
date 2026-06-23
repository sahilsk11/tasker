import { z } from "zod";

export const agentProviderSchema = z.enum(["codex", "opencode", "cursor"]);

export const runEventSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  message: z.string(),
  taskId: z.string().uuid(),
  type: z.enum(["status", "stdout", "stderr", "artifact", "error"])
});

export type AgentProvider = z.infer<typeof agentProviderSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;

export {
  agentPromptProviders,
  agentPromptProviderValues,
  defaultAgentPromptProvider,
  findTemplatePlaceholders,
  findUnknownPlaceholders,
  knownPromptPlaceholders,
  renderTaskActionTemplate,
  UnknownPromptPlaceholderError
} from "./task-actions/index.js";
export type {
  AgentPromptProvider,
  KnownPromptPlaceholder,
  TaskActionPromptContext
} from "./task-actions/index.js";
