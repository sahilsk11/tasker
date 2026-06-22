import { createApp } from "@tasker/api/app";
import { loadDaemonEnv } from "./config.js";
import { registerStaticFrontend } from "./static-frontend.js";

const env = loadDaemonEnv();
const app = await createApp({
  ...(env.codexSessionsRoot === undefined
    ? {}
    : { codexSessionsRoot: env.codexSessionsRoot }),
  databasePath: env.databasePath,
  linearApiKey: env.linearApiKey,
  ...(env.migrationsDirectory === undefined
    ? {}
    : { migrationsDirectory: env.migrationsDirectory }),
  publicApiBaseUrl: env.publicApiBaseUrl,
  publicAppBaseUrl: env.publicAppBaseUrl,
  routePrefix: "/api"
});

app.get("/health", () => ({
  ok: true
}));

await registerStaticFrontend(app, env.webDistDirectory);
await app.listen({ host: env.host, port: env.port });
