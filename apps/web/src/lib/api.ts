import { apiBaseUrl } from "@/lib/env";

export type ApiError = Error & {
  readonly body: unknown;
  readonly status: number;
};

class ApiErrorImpl extends Error implements ApiError {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && error.name === "ApiError";
}

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${apiBaseUrl}${path}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: "include",
    headers: {
      "Accept": "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    method
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed = parseResponseBody(text);

  if (!response.ok) {
    throw new ApiErrorImpl(getErrorMessage(response, parsed), response.status, parsed);
  }

  return parsed as T;
}

function parseResponseBody(text: string): unknown {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(response: Response, body: unknown): string {
  const errorMessage = getStringProperty(body, "error");
  if (errorMessage != null) {
    return errorMessage;
  }

  return `${String(response.status)} ${response.statusText}`;
}

function getStringProperty(value: unknown, key: string): string | null {
  if (value == null || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const property = record[key];
  return typeof property === "string" ? property : null;
}

export const apiClient = {
  delete: <T>(path: string) => request<T>("DELETE", path),
  get: <T>(path: string) => request<T>("GET", path),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body)
};
