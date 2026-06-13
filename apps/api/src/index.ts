import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";

const env = loadEnv();
const app = await createApp({
  databasePath: env.databasePath,
  linearApiKey: env.linearApiKey
});

await app.listen({ host: env.host, port: env.port });
