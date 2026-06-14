import { apiClient, apiUrl } from "@/lib/api";

export type TranscriptEntryLifecycle = "completed" | "started" | "updated";
export type TranscriptEntryDisplay = "collapsed" | "hidden" | "visible";
export type TranscriptKind =
  | "account_info"
  | "assistant_text"
  | "compact_boundary"
  | "compact_summary"
  | "context_cleared"
  | "context_window_updated"
  | "interrupted"
  | "reasoning"
  | "result"
  | "status"
  | "system_init"
  | "tool_call"
  | "tool_result"
  | "user_prompt";

export type ApiTask = { readonly id: string };
export type ApiSession = { readonly id: string };
export type TodoItem = Readonly<{
  activeForm: string;
  content: string;
  status: "completed" | "in_progress" | "pending";
}>;

export type NormalizedToolCall = {
  readonly input: Readonly<Record<string, unknown>>;
  readonly rawInput?: Readonly<Record<string, unknown>> | undefined;
  readonly toolId: string;
  readonly toolKind: string;
  readonly toolName: string;
};

export type TranscriptEntryBase = {
  readonly _id: string;
  readonly createdAt: number;
  readonly debugRaw?: string;
  readonly display?: TranscriptEntryDisplay;
  readonly hidden?: boolean;
  readonly itemId?: string;
  readonly lifecycle?: TranscriptEntryLifecycle;
  readonly messageId?: string;
  readonly sequence?: number;
  readonly turnId?: string;
};

export type TranscriptEntry = TranscriptEntryBase & Readonly<Record<string, unknown>> & {
  readonly kind: TranscriptKind;
};

export type SessionStreamEvent =
  | {
      readonly entry: TranscriptEntry;
      readonly sessionId: string;
      readonly type: "transcript_entry";
    }
  | {
      readonly sessionId: string;
      readonly sessionToken: string;
      readonly type: "session_token";
    }
  | {
      readonly sessionId: string;
      readonly turnId: string;
      readonly type: "turn_started";
    }
  | {
      readonly outcome: "cancelled" | "error" | "success";
      readonly sessionId: string;
      readonly turnId: string;
      readonly type: "turn_finished";
    }
  | {
      readonly message: string;
      readonly sessionId: string;
      readonly turnId?: string;
      readonly type: "turn_failed";
    };

export async function createChatTask(): Promise<ApiTask> {
  const { task } = await apiClient.post<{ readonly task: ApiTask }>("/tasks", {
    description: "Detached local Codex chat session created from /chat.",
    parentTaskId: null,
    title: "Codex Chat"
  });
  return task;
}

export async function createCodexSession(
  taskId: string,
  input: { readonly localPath: string }
): Promise<ApiSession> {
  const { session } = await apiClient.post<{ readonly session: ApiSession }>(
    `/tasks/${taskId}/sessions`,
    {
      localPath: input.localPath,
      model: null,
      planMode: false,
      provider: "codex",
      title: "Codex Chat"
    }
  );
  return session;
}

export async function getSessionTranscript(
  sessionId: string
): Promise<readonly TranscriptEntry[]> {
  const { entries } = await apiClient.get<{ readonly entries: readonly TranscriptEntry[] }>(
    `/sessions/${sessionId}/transcript`
  );
  return entries;
}

export async function sendSessionMessage(
  sessionId: string,
  content: string
): Promise<ApiSession> {
  const { session } = await apiClient.post<{ readonly session: ApiSession }>(
    `/sessions/${sessionId}/messages`,
    { content }
  );
  return session;
}

export function openSessionEventSource(sessionId: string): EventSource {
  return new EventSource(apiUrl(`/sessions/${sessionId}/events`), {
    withCredentials: true
  });
}
