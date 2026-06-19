import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { BadRequestError } from "./errors.js";

const validationErrorCodes = new Set([
  "EACCES",
  "ELOOP",
  "ENOENT",
  "ENOTDIR",
  "EPERM"
]);

export async function normalizeDirectoryPath(
  value: string,
  label: string
): Promise<string> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError(`${label} is required`);
  }

  const path = resolve(trimmed);
  const pathStat = await stat(path).catch((error: unknown) => {
    if (isNodeError(error) && validationErrorCodes.has(error.code ?? "")) {
      throw new BadRequestError(`${label} must be an existing directory`);
    }

    throw error;
  });

  if (!pathStat.isDirectory()) {
    throw new BadRequestError(`${label} must be an existing directory`);
  }

  return path;
}

export async function normalizeOptionalDirectoryPath(
  value: string | null,
  label: string
): Promise<string | null> {
  const trimmed = value?.trim();
  if (trimmed == null || trimmed.length === 0) {
    return null;
  }

  return normalizeDirectoryPath(trimmed, label);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
