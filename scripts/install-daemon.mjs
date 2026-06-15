#!/usr/bin/env node
import { parseArgs, printHelp } from "./daemon-install/args.mjs";
import { getInstallChoices } from "./daemon-install/prompt.mjs";
import { getInstallPaths } from "./daemon-install/install-paths.mjs";
import { runPreflight } from "./daemon-install/preflight.mjs";
import { buildSource, installRuntime } from "./daemon-install/runtime.mjs";
import { installServices } from "./daemon-install/service-manager.mjs";
import { openTasker, verifyInstall } from "./daemon-install/verify.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const choices = await getInstallChoices(options);
  if (choices == null) {
    process.exit(0);
  }

  if (!choices.configure) {
    console.info("Tasker daemon setup skipped.");
    process.exit(0);
  }

  const paths = getInstallPaths(process.platform, options.installRoot);
  await runPreflight(process.platform, choices, options);
  await buildSource();
  await installRuntime(paths, choices, options);
  if (options.skipService) {
    console.info("Service install skipped.");
  } else {
    await installServices(paths, choices, options);
    await verifyInstall(choices, options);
    await openTasker(choices, options);
  }

  console.info(
    options.dryRun ? `Tasker dry run complete for ${paths.root}` : `Tasker installed at ${paths.root}`
  );
  console.info(
    choices.access === "pretty"
      ? "Open http://tasker.localhost"
      : `Open http://tasker.localhost:${String(choices.port)}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
