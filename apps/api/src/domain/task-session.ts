import type { TaskId } from "./task.js";

export type TaskSessionId = string;

export type SessionProvider = string;

export type TaskSessionMetadata = Record<string, unknown>;

export type SessionContext = {
  readonly appName?: string | null;
  readonly clientName?: string | null;
  readonly displayTitle?: string | null;
  readonly machineName?: string | null;
  readonly sourceUrl?: string | null;
};

export type TaskSession = Required<SessionContext> & {
  readonly actionId: string | null;
  readonly claimedAt: Date | null;
  readonly createdAt: Date;
  readonly id: TaskSessionId;
  readonly metadata: TaskSessionMetadata | null;
  readonly provider: SessionProvider;
  readonly providerId: string | null;
  readonly taskId: TaskId;
  readonly transcriptPath: string | null;
};

export type CreateTaskSessionInput = SessionContext & {
  readonly actionId?: string | null;
  readonly claimedAt?: Date | null;
  readonly metadata?: TaskSessionMetadata | null;
  readonly provider: SessionProvider;
  readonly providerId?: string | null;
  readonly transcriptPath?: string | null;
};

export type ClaimTaskSessionInput = SessionContext & {
  readonly metadata?: TaskSessionMetadata | null;
  readonly provider?: SessionProvider | null;
  readonly providerId?: string | null;
  readonly transcriptPath?: string | null;
};

export function safeSessionUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const url = URL.parse(value);
  if (url == null || url.username.length > 0 || url.password.length > 0) {
    return null;
  }
  if (url.protocol === "https:" || url.protocol === "http:") {
    return url.href;
  }
  if (url.protocol === "t3-thread:" && url.host === "v2" && url.search === "" && url.hash === "" &&
      /^\/[a-z\d-]+\/[a-z\d:%._-]+$/iu.test(url.pathname)) {
    return url.href;
  }
  if (url.protocol === "codex:" && url.host === "threads" && url.search === "" && url.hash === "" &&
      /^\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(url.pathname)) {
    return url.href;
  }
  return null;
}
