import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../install-utils/exec.mjs";
import { installRuntimeSnapshot } from "../install-utils/runtime-snapshot.mjs";

export async function buildSource() {
  await run("pnpm", ["build"]);
}

export async function installRuntime(paths, choices, options) {
  await installRuntimeSnapshot({
    appDir: paths.appDir,
    dryRun: options.dryRun,
    dryRunMessages: [
      `dry-run: install runtime at ${paths.appDir}`,
      `dry-run: write config ${paths.configPath}`
    ],
    packageJson: createRuntimePackage(),
    async prepare(stagingDir) {
      await mkdir(paths.logsDir, { recursive: true });
      await cp("apps/daemon/dist", join(stagingDir, "dist"), { recursive: true });
      await cp("apps/web/dist", join(stagingDir, "web"), { recursive: true });
      await cp("apps/api/migrations", join(stagingDir, "migrations"), { recursive: true });
    }
  });
  if (options.dryRun) {
    return;
  }

  await writeFile(
    paths.configPath,
    `${JSON.stringify(createConfig(paths, choices), null, 2)}\n`
  );

  console.info(`Runtime installed at ${paths.appDir}`);
}

function createRuntimePackage() {
  return {
    dependencies: {
      "better-sqlite3": "^12.10.0",
      fastify: "^5.8.5",
      kysely: "^0.29.2",
      zod: "^3.25.76"
    },
    name: "tasker-runtime",
    packageManager: "pnpm@10.34.3",
    pnpm: {
      onlyBuiltDependencies: ["better-sqlite3"]
    },
    private: true,
    scripts: {
      start: "node dist/index.js"
    },
    type: "module",
    version: "0.0.0"
  };
}

function createConfig(paths, choices) {
  return {
    access: choices.access,
    appDir: paths.appDir,
    databasePath: paths.databasePath,
    hostname: "tasker.localhost",
    port: choices.port,
    url:
      choices.access === "pretty"
        ? "http://tasker.localhost"
        : `http://tasker.localhost:${String(choices.port)}`
  };
}
