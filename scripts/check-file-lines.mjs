import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const maxLines = 1000;
const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules"
]);
const ignoredFiles = new Set(["pnpm-lock.yaml"]);

const violations = [];

await walk(root);

if (violations.length > 0) {
  console.error(`Files over ${String(maxLines)} lines:`);
  for (const violation of violations) {
    console.error(`- ${violation.path}: ${String(violation.lines)}`);
  }
  process.exitCode = 1;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const localPath = relative(root, path);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await walk(path);
      }
      continue;
    }

    if (ignoredFiles.has(localPath)) {
      continue;
    }

    const text = await readFile(path, "utf8");
    const lines = text.length === 0 ? 0 : text.split(/\r?\n/u).length;

    if (lines > maxLines) {
      violations.push({ lines, path: localPath });
    }
  }
}
