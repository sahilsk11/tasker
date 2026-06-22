import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";

const root = process.cwd();
const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const runDirectory = await mkdtemp(join(tmpdir(), "tasker-dev-"));
const databasePath = join(runDirectory, "tasker.sqlite");
const apiPort = await findOpenPort();
const webPort = await findOpenPort();
const apiUrl = `http://127.0.0.1:${String(apiPort)}`;
const webUrl = `http://127.0.0.1:${String(webPort)}`;
const manifestDirectory = resolve(root, ".tasker", "dev-runs");
const manifestPath = join(manifestDirectory, `${runId}.json`);
const children = [];
let shuttingDown = false;

await mkdir(manifestDirectory, { recursive: true });

const api = spawnManaged(
  "pnpm",
  ["--dir", "apps/api", "exec", "tsx", "watch", "src/index.ts"],
  {
    DATABASE_PATH: databasePath,
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    PUBLIC_API_BASE_URL: apiUrl
  }
);

const web = spawnManaged(
  "pnpm",
  [
    "--dir",
    "apps/web",
    "exec",
    "vite",
    "--host",
    "0.0.0.0",
    "--port",
    String(webPort),
    "--strictPort"
  ],
  {
    VITE_LOCAL_API_BASE_URL: apiUrl
  }
);

await Promise.all([
  waitForJson(`${apiUrl}/runtime`),
  waitForText(webUrl)
]);

const manifest = {
  apiPid: api.pid,
  apiUrl,
  databasePath,
  manifestPath,
  runDirectory,
  runId,
  startedAt: new Date().toISOString(),
  webPid: web.pid,
  webUrl
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.info("");
console.info("Tasker worktree dev environment is running.");
console.info(`API:      ${apiUrl}`);
console.info(`Web:      ${webUrl}`);
console.info(`SQLite:   ${databasePath}`);
console.info(`Manifest: ${manifestPath}`);
console.info("");
console.info("Press Ctrl-C to stop both dev servers.");

await waitForShutdown();

async function findOpenPort() {
  return await new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address == null || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a port")));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

function spawnManaged(command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      ...env
    },
    stdio: "inherit"
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(
      `${command} ${args.join(" ")} exited early with code ${String(code)} signal ${String(signal)}`
    );
    shutdown(1);
  });
  return child;
}

async function waitForJson(url) {
  await waitFor(url, async (response) => {
    await response.json();
  });
}

async function waitForText(url) {
  await waitFor(url, async (response) => {
    await response.text();
  });
}

async function waitFor(url, consume) {
  const deadline = Date.now() + 30_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await consume(response);
        return;
      }
      lastError = new Error(`${url} returned ${String(response.status)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForShutdown() {
  await new Promise((resolveShutdown) => {
    process.on("SIGINT", () => {
      shutdown(0);
      resolveShutdown();
    });
    process.on("SIGTERM", () => {
      shutdown(0);
      resolveShutdown();
    });
  });
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode == null && child.signalCode == null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }
  process.exitCode = exitCode;
}
