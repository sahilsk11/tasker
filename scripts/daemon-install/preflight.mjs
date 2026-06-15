import { lookup } from "node:dns/promises";
import { createServer } from "node:net";
import { read } from "./exec.mjs";

export async function runPreflight(platform, choices, options) {
  const [nodeVersion] = process.versions.node.split(".");
  if (Number.parseInt(nodeVersion ?? "0", 10) !== 24) {
    throw new Error(`Tasker requires Node 24. Current Node is ${process.versions.node}.`);
  }

  await read("pnpm", ["--version"]);
  await assertPortAvailable(choices.port);
  await checkServiceTools(platform, choices, options);
  await checkTaskerLocalhost();
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => {
      reject(new Error(`Port ${String(port)} is already in use.`));
    });
    server.once("listening", () => {
      server.close(resolve);
    });
    server.listen(port, "127.0.0.1");
  });
}

async function checkTaskerLocalhost() {
  try {
    const results = await lookup("tasker.localhost", { all: true });
    const resolvesToLoopback = results.some(
      (result) => result.address === "127.0.0.1" || result.address === "::1"
    );
    if (!resolvesToLoopback) {
      console.warn("tasker.localhost did not resolve to loopback on this machine.");
    }
  } catch {
    console.warn("tasker.localhost could not be resolved on this machine.");
  }
}

async function checkServiceTools(platform, choices, options) {
  if (options.dryRun || options.skipService) {
    return;
  }

  if (platform === "darwin") {
    await read("launchctl", ["version"]);
  } else if (platform === "linux") {
    await read("systemctl", ["--user", "--version"]);
  }

  if (choices.access === "pretty") {
    await read("sudo", ["-V"]);
  }
}
