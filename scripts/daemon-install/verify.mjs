import { request } from "node:http";
import { run } from "./exec.mjs";

export async function verifyInstall(choices, options) {
  const url = `http://127.0.0.1:${String(choices.port)}/health`;
  if (options.dryRun) {
    console.info(`dry-run: verify ${url}`);
    return;
  }

  await waitForHealth(url);
}

export async function openTasker(choices, options) {
  if (!options.open || options.dryRun) {
    return;
  }

  const url =
    choices.access === "pretty"
      ? "http://tasker.localhost"
      : `http://tasker.localhost:${String(choices.port)}`;

  if (process.platform === "darwin") {
    await run("open", [url]);
  } else if (process.platform === "linux") {
    await run("xdg-open", [url]).catch(() => undefined);
  }
}

async function waitForHealth(url) {
  const deadline = Date.now() + 15_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const status = await getStatus(url);
      if (status === 200) {
        return;
      }
      lastError = new Error(`Health returned ${String(status)}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  throw lastError ?? new Error("Tasker health check timed out.");
}

async function getStatus(url) {
  return await new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      response.resume();
      response.on("end", () => {
        resolve(response.statusCode ?? 0);
      });
    });
    req.on("error", reject);
    req.end();
  });
}
