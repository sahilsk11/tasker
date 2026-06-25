import { request } from "node:http";
import { run } from "../install-utils/exec.mjs";

export async function verifyInstall(choices, options) {
  const internalUrl = `http://127.0.0.1:${String(choices.port)}/health`;
  const accessUrl = `${getAccessUrl(choices)}/health`;
  if (options.dryRun) {
    console.info(`dry-run: verify ${internalUrl}`);
    console.info(`dry-run: verify ${accessUrl}`);
    return;
  }

  await waitForHealth(internalUrl);
  await waitForHealth(accessUrl);
}

export async function openTasker(choices, options) {
  if (!options.open || options.dryRun) {
    return;
  }

  const url = getAccessUrl(choices);

  if (process.platform === "darwin") {
    await run("open", [url]);
  } else if (process.platform === "linux") {
    await run("xdg-open", [url]).catch((error) => {
      console.warn(`Could not open ${url}: ${getErrorMessage(error)}`);
    });
  }
}

function getAccessUrl(choices) {
  return choices.access === "pretty"
    ? "http://tasker.localhost"
    : `http://tasker.localhost:${String(choices.port)}`;
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

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
