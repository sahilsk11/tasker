import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";

const env = loadEnv();
const app = await createApp({
  ...(env.codexSessionsRoot === undefined
    ? {}
    : { codexSessionsRoot: env.codexSessionsRoot }),
  databasePath: env.databasePath,
  linearApiKey: env.linearApiKey,
  publicApiBaseUrl: env.publicApiBaseUrl
});

await app.listen({ host: env.host, port: env.port });
