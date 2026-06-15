import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { run } from "./exec.mjs";
import { createProxyService, writeUserService } from "./service-files.mjs";

export async function installServices(paths, choices, options) {
  if (options.dryRun) {
    console.info(`dry-run: write user service ${paths.servicePath}`);
  } else {
    await writeUserService(paths, choices);
  }

  await startUserService(paths, options);

  if (choices.access === "pretty") {
    await installProxyService(paths, choices, options);
  }
}

async function startUserService(paths, options) {
  if (paths.platform === "darwin") {
    const domain = `gui/${String(process.getuid())}`;
    await run("launchctl", ["bootout", domain, paths.servicePath], {
      ...options,
      stdio: "ignore"
    }).catch(() => undefined);
    await run("launchctl", ["bootstrap", domain, paths.servicePath], options);
    await run("launchctl", ["enable", `${domain}/com.tasker.app`], options);
    await run("launchctl", ["kickstart", "-k", `${domain}/com.tasker.app`], options);
    return;
  }

  await run("systemctl", ["--user", "daemon-reload"], options);
  await run("systemctl", ["--user", "enable", "--now", "tasker.service"], options);
  await run("systemctl", ["--user", "restart", "tasker.service"], options);
}

async function installProxyService(paths, choices, options) {
  const service = createProxyService(paths, choices);

  if (options.dryRun) {
    console.info(`dry-run: write privileged proxy service ${service.destination}`);
    return;
  }

  await mkdir(dirname(service.source), { recursive: true });
  await writeFile(service.source, service.text);
  await run("sudo", ["cp", service.source, service.destination], options);

  for (const [command, ...args] of service.reload) {
    await run(command, args, options).catch((error) => {
      if (args.includes("bootout")) {
        return;
      }

      throw error;
    });
  }
}
