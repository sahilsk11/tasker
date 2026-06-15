import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./exec.mjs";

export async function buildSource() {
  await run("pnpm", ["build"]);
}

export async function installRuntime(paths, choices, options) {
  const stagingDir = `${paths.appDir}.tmp`;
  if (options.dryRun) {
    console.info(`dry-run: install runtime at ${paths.appDir}`);
    console.info(`dry-run: write config ${paths.configPath}`);
    return;
  }

  await rm(stagingDir, { force: true, recursive: true });
  await mkdir(stagingDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  await cp("apps/daemon/dist", join(stagingDir, "dist"), { recursive: true });
  await cp("apps/web/dist", join(stagingDir, "web"), { recursive: true });
  await cp("apps/api/migrations", join(stagingDir, "migrations"), { recursive: true });
  await writeFile(
    join(stagingDir, "package.json"),
    `${JSON.stringify(createRuntimePackage(), null, 2)}\n`
  );

  await run("pnpm", ["install", "--prod"], { cwd: stagingDir });
  await rm(paths.appDir, { force: true, recursive: true });
  await rename(stagingDir, paths.appDir);

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
