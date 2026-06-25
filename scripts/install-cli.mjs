#!/usr/bin/env node
import { chmod, cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { delimiter } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./daemon-install/exec.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  await runPreflight();
  await buildCli(options);

  const paths = getCliInstallPaths(process.platform, options);
  await installCliRuntime(paths, options);
  await verifyCli(paths, options);
  printInstallSummary(paths, options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    binDir: null,
    dryRun: false,
    help: false,
    installRoot: null,
    verify: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--bin-dir") {
      options.binDir = readValue(argv, (index += 1), arg);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--install-root") {
      options.installRoot = readValue(argv, (index += 1), arg);
    } else if (arg === "--no-verify") {
      options.verify = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.info(`Usage: pnpm install-cli [options]

Options:
  --install-root <path>  Override the Tasker CLI install directory
  --bin-dir <path>       Directory where the tasker command shim is written
  --dry-run              Print actions without writing files
  --no-verify            Skip the installed tasker runtime verification
  -h, --help             Show this help
`);
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (value == null || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

async function runPreflight() {
  const [nodeVersion] = process.versions.node.split(".");
  if (Number.parseInt(nodeVersion ?? "0", 10) !== 24) {
    throw new Error(`Tasker CLI requires Node 24. Current Node is ${process.versions.node}.`);
  }
}

async function buildCli(options) {
  await run("pnpm", ["--filter", "@tasker/core", "build"], { dryRun: options.dryRun });
  await run("pnpm", ["--filter", "@tasker/cli", "build"], { dryRun: options.dryRun });
}

function getCliInstallPaths(platform, options) {
  const root = options.installRoot ?? getDefaultInstallRoot(platform);
  const appDir = join(root, "app");
  const binDir = options.binDir ?? getDefaultBinDir();

  return {
    appDir,
    binDir,
    configPath: join(root, "config.json"),
    databasePath: join(root, "tasker.sqlite"),
    migrationsDir: join(appDir, "migrations"),
    root,
    shimPath: join(binDir, "tasker"),
    taskActionsPath: join(appDir, "task-actions.json")
  };
}

function getDefaultInstallRoot(platform) {
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Tasker CLI");
  }

  if (platform === "linux") {
    return join(homedir(), ".local", "share", "tasker-cli");
  }

  throw new Error(`Unsupported platform for CLI install: ${platform}`);
}

function getDefaultBinDir() {
  const candidates = [join(homedir(), ".local", "bin"), join(homedir(), "bin")];
  const pathEntries = new Set((process.env.PATH ?? "").split(delimiter).filter(Boolean));
  return candidates.find((candidate) => pathEntries.has(candidate)) ?? candidates[0];
}

async function installCliRuntime(paths, options) {
  const stagingDir = `${paths.appDir}.tmp`;
  if (options.dryRun) {
    console.info(`dry-run: install CLI runtime at ${paths.appDir}`);
    console.info(`dry-run: write shim ${paths.shimPath}`);
    console.info(`dry-run: write config ${paths.configPath}`);
    return;
  }

  await rm(stagingDir, { force: true, recursive: true });
  await mkdir(stagingDir, { recursive: true });
  await mkdir(paths.binDir, { recursive: true });

  await cp("packages/cli/dist", join(stagingDir, "dist"), { recursive: true });
  await cp("apps/api/migrations", join(stagingDir, "migrations"), { recursive: true });
  await cp("apps/api/task-actions.json", join(stagingDir, "task-actions.json"));
  await writeFile(
    join(stagingDir, "package.json"),
    `${JSON.stringify(createRuntimePackage(), null, 2)}\n`
  );

  await run("pnpm", ["install", "--prod"], { cwd: stagingDir });
  await rm(paths.appDir, { force: true, recursive: true });
  await rename(stagingDir, paths.appDir);
  await writeFile(paths.configPath, `${JSON.stringify(createConfig(paths), null, 2)}\n`);
  await writeFile(paths.shimPath, createShim(paths));
  await chmod(paths.shimPath, 0o755);
}

function createRuntimePackage() {
  return {
    dependencies: {
      "better-sqlite3": "^12.10.0"
    },
    name: "tasker-cli-runtime",
    packageManager: "pnpm@10.34.3",
    pnpm: {
      onlyBuiltDependencies: ["better-sqlite3"]
    },
    private: true,
    type: "module",
    version: "0.0.0"
  };
}

function createConfig(paths) {
  return {
    appDir: paths.appDir,
    databasePath: paths.databasePath,
    taskActionsPath: paths.taskActionsPath
  };
}

function createShim(paths) {
  return `#!/usr/bin/env sh
set -eu

if [ -z "\${DATABASE_PATH:-}" ]; then
  if [ -n "\${TASKER_DATABASE_PATH:-}" ]; then
    DATABASE_PATH=$TASKER_DATABASE_PATH
  else
    DATABASE_PATH=${quoteShell(paths.databasePath)}
  fi
fi

if [ -z "\${TASKER_MIGRATIONS_DIR:-}" ]; then
  TASKER_MIGRATIONS_DIR=${quoteShell(paths.migrationsDir)}
fi

if [ -z "\${TASK_ACTIONS_PATH:-}" ]; then
  TASK_ACTIONS_PATH=${quoteShell(paths.taskActionsPath)}
fi

export DATABASE_PATH
export TASKER_MIGRATIONS_DIR
export TASK_ACTIONS_PATH

exec node ${quoteShell(join(paths.appDir, "dist", "bin.js"))} "$@"
`;
}

function quoteShell(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function verifyCli(paths, options) {
  if (!options.verify || options.dryRun) {
    return;
  }

  await run(paths.shimPath, ["runtime"]);
}

function printInstallSummary(paths, options) {
  console.info(
    options.dryRun ? `Tasker CLI dry run complete for ${paths.root}` : `Tasker CLI installed at ${paths.root}`
  );
  console.info(`Command shim: ${paths.shimPath}`);

  if (!isDirectoryOnPath(paths.binDir)) {
    console.warn(`${paths.binDir} is not on PATH. Add it before running tasker by name.`);
  }

  console.info("Run: tasker runtime");
}

function isDirectoryOnPath(directory) {
  return (process.env.PATH ?? "").split(delimiter).includes(directory);
}
