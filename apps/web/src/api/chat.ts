import { apiClient, apiUrl } from "@/lib/api";

export type ChatTask = {
  readonly id: string;
  readonly title: string;
};

export type ChatSession = {
  readonly id: string;
  readonly localPath: string;
  readonly model: string | null;
  readonly provider: "codex" | "cursor" | "opencode";
  readonly status: "failed" | "idle" | "running" | "starting" | "waiting_for_user";
  readonly taskId: string;
  readonly title: string;
};

export type TranscriptEntryBase = {
  readonly _id: string;
  readonly createdAt: number;
  readonly display?: "collapsed" | "hidden" | "visible";
  readonly hidden?: boolean;
  readonly itemId?: string;
  readonly lifecycle?: "completed" | "started" | "updated";
  readonly sequence?: number;
  readonly turnId?: string;
};

export type TranscriptEntry =
  | (TranscriptEntryBase & { readonly content: string; readonly kind: "user_prompt" })
  | (TranscriptEntryBase & { readonly kind: "assistant_text"; readonly text: string })
  | (TranscriptEntryBase & { readonly kind: "reasoning"; readonly text: string })
  | (TranscriptEntryBase & {
      readonly kind: "tool_call";
      readonly tool: {
        readonly input: Record<string, unknown>;
        readonly rawInput?: Record<string, unknown>;
        readonly toolId: string;
        readonly toolKind: string;
        readonly toolName: string;
      };
    })
  | (TranscriptEntryBase & {
      readonly content: unknown;
      readonly isError?: boolean;
      readonly kind: "tool_result";
      readonly toolId: string;
    })
  | (TranscriptEntryBase & {
      readonly durationMs: number;
      readonly isError: boolean;
      readonly kind: "result";
      readonly result: string;
      readonly subtype: "cancelled" | "error" | "success";
    })
  | (TranscriptEntryBase & { readonly kind: "status"; readonly status: string })
  | (TranscriptEntryBase & { readonly kind: "system_init"; readonly model: string })
  | (TranscriptEntryBase & { readonly kind: "context_window_updated"; readonly usage: unknown })
  | (TranscriptEntryBase & {
      readonly detail?: string;
      readonly kind: "interrupted";
      readonly reason?: string;
    });

export type SessionStreamEvent =
  | {
      readonly entry: TranscriptEntry;
      readonly sessionId: string;
      readonly type: "transcript_entry";
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
    }
  | {
      readonly sessionId: string;
      readonly sessionToken: string;
      readonly type: "session_token";
    };

export async function listChatTasks(): Promise<readonly ChatTask[]> {
  const { tasks } = await apiClient.get<{ readonly tasks: readonly ChatTask[] }>("/tasks");
  return tasks;
}

export async function createChatTask(title: string): Promise<ChatTask> {
  const { task } = await apiClient.post<{ readonly task: ChatTask }>("/tasks", {
    description: "Codex chat created from assistant-ui spike.",
    parentTaskId: null,
    title
  });
  return task;
}

export async function listChatSessions(taskId: string): Promise<readonly ChatSession[]> {
  const { sessions } = await apiClient.get<{ readonly sessions: readonly ChatSession[] }>(
    `/tasks/${taskId}/sessions`
  );
  return sessions.filter((session) => session.provider === "codex");
}

export async function createCodexSession(
  taskId: string,
  input: { readonly localPath: string; readonly title: string }
): Promise<ChatSession> {
  const { session } = await apiClient.post<{ readonly session: ChatSession }>(
    `/tasks/${taskId}/sessions`,
    {
      localPath: input.localPath,
      planMode: false,
      provider: "codex",
      title: input.title
    }
  );
  return session;
}

export async function fetchTranscript(
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
): Promise<void> {
  await apiClient.post(`/sessions/${sessionId}/messages`, { content });
}

export async function cancelSessionTurn(sessionId: string): Promise<void> {
  await apiClient.post(`/sessions/${sessionId}/cancel`);
}

export function sessionEventsUrl(sessionId: string): string {
  return apiUrl(`/sessions/${sessionId}/events`);
}
