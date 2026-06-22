export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "text">>;

export type ApiClient = {
  readonly get: <T>(path: string) => Promise<T>;
  readonly patch: <T>(path: string, body?: unknown) => Promise<T>;
  readonly post: <T>(path: string, body?: unknown) => Promise<T>;
};

export class ApiError extends Error {
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
  return error instanceof ApiError;
}

export function createApiClient(
  baseUrl: string,
  fetchLike: FetchLike = fetch
): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchLike(apiUrl(baseUrl, path), {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
      throw new ApiError(getErrorMessage(response, parsed), response.status, parsed);
    }

    return parsed as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body)
  };
}

function apiUrl(baseUrl: string, path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${baseUrl}${path}`;
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

function getErrorMessage(response: Pick<Response, "status" | "statusText">, body: unknown): string {
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
