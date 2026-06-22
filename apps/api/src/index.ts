import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";

const env = loadEnv();
const app = await createApp({
  agentRunProvider: env.agentRunProvider,
  ...(env.codexSessionsRoot === undefined
    ? {}
    : { codexSessionsRoot: env.codexSessionsRoot }),
  databasePath: env.databasePath,
  kanna: {
    agentModel: env.kannaAgentModel,
    agentProvider: env.kannaAgentProvider,
    baseUrl: env.kannaBaseUrl,
    ...(env.kannaChatsLogPath === undefined
      ? {}
      : { chatsLogPath: env.kannaChatsLogPath }),
    codexFastMode: env.kannaCodexFastMode,
    codexReasoningEffort: env.kannaCodexReasoningEffort
  },
  linearApiKey: env.linearApiKey,
  publicApiBaseUrl: env.publicApiBaseUrl,
  ...(env.taskActionsPath === undefined ? {} : { taskActionsPath: env.taskActionsPath })
});

await app.listen({ host: env.host, port: env.port });
