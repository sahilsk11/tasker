import { createConfigError } from "./errors.js";

const DEFAULT_DAEMON_API_BASE_URL = "http://tasker.localhost:48273/api";
const TASKER_DAEMON_HOSTNAME = "tasker.localhost";
const TASKER_DAEMON_PORT = "48273";

export type ResolveApiBaseUrlOptions = {
  readonly explicitBaseUrl?: string;
  readonly env: {
    readonly TASKER_API_BASE_URL?: string;
  };
};

export function resolveApiBaseUrl(options: ResolveApiBaseUrlOptions): string {
  const selected =
    options.explicitBaseUrl ?? options.env.TASKER_API_BASE_URL ?? DEFAULT_DAEMON_API_BASE_URL;

  return normalizeApiBaseUrl(selected);
}

export function normalizeApiBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw createConfigError("API base URL must not be empty");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (error) {
    throw createConfigError(`Invalid API base URL: ${trimmed}`, { cause: error });
  }

  url.hash = "";
  url.search = "";
  url.pathname = normalizePathname(url);

  return url.toString().replace(/\/$/, "");
}

function normalizePathname(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, "");
  if (isInstalledDaemonRoot(url) && pathname !== "/api" && !pathname.startsWith("/api/")) {
    return `${pathname}/api`.replace(/^\/api$/, "/api");
  }

  return pathname.length === 0 ? "/" : pathname;
}

function isInstalledDaemonRoot(url: URL): boolean {
  return url.hostname === TASKER_DAEMON_HOSTNAME && url.port === TASKER_DAEMON_PORT;
}
