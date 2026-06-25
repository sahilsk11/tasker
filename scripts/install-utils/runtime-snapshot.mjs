import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./exec.mjs";

export async function installRuntimeSnapshot(options) {
  const stagingDir = `${options.appDir}.tmp`;
  if (options.dryRun) {
    for (const message of options.dryRunMessages) {
      console.info(message);
    }
    return;
  }

  await rm(stagingDir, { force: true, recursive: true });
  await mkdir(stagingDir, { recursive: true });
  await options.prepare(stagingDir);
  await writeFile(
    join(stagingDir, "package.json"),
    `${JSON.stringify(options.packageJson, null, 2)}\n`
  );

  await run("pnpm", ["install", "--prod"], { cwd: stagingDir });
  await rm(options.appDir, { force: true, recursive: true });
  await rename(stagingDir, options.appDir);
}
