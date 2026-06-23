import { createApp } from "@tasker/api/app";
import { loadDaemonEnv } from "./config.js";
import { registerStaticFrontend } from "./static-frontend.js";

const env = loadDaemonEnv();
const app = await createApp({
  artifactStorage: {
    ...(env.artifactArchiveRoot === undefined
      ? {}
      : { archiveRoot: env.artifactArchiveRoot }),
    ...(env.artifactRoot === undefined ? {} : { activeRoot: env.artifactRoot })
  },
  ...(env.codexSessionsRoot === undefined
    ? {}
    : { codexSessionsRoot: env.codexSessionsRoot }),
  databasePath: env.databasePath,
  linearApiKey: env.linearApiKey,
  ...(env.migrationsDirectory === undefined
    ? {}
    : { migrationsDirectory: env.migrationsDirectory }),
  routePrefix: "/api"
});

app.get("/health", () => ({
  ok: true
}));

await registerStaticFrontend(app, env.webDistDirectory);
await app.listen({ host: env.host, port: env.port });
