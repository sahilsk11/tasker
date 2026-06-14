import type { TaskSessionId } from "./task-session.js";
import type { NormalizedToolCall } from "./tool-call.js";
import type { TranscriptEntry, TranscriptEntryDisplay } from "./transcript-entry.js";

export type TaskSessionChatPartState = "done" | "error" | "running";

export type TaskSessionChatMessagePart =
  | {
      readonly entryId: string;
      readonly state: TaskSessionChatPartState;
      readonly text: string;
      readonly type: "reasoning";
    }
  | {
      readonly entryId: string;
      readonly state: TaskSessionChatPartState;
      readonly text: string;
      readonly type: "status";
    }
  | {
      readonly entryId: string;
      readonly state: TaskSessionChatPartState;
      readonly text: string;
      readonly type: "text";
    }
  | {
      readonly display?: TranscriptEntryDisplay;
      readonly entryId: string;
      readonly input: unknown;
      readonly providerItemId?: string;
      readonly state: TaskSessionChatPartState;
      readonly toolCallId: string;
      readonly toolKind: string;
      readonly toolName: string;
      readonly type: "tool-call";
    }
  | {
      readonly entryId: string;
      readonly isError: boolean;
      readonly output: unknown;
      readonly state: Extract<TaskSessionChatPartState, "done" | "error">;
      readonly toolCallId: string;
      readonly type: "tool-result";
    };

export type TaskSessionChatMessage = {
  readonly createdAt: number;
  readonly id: string;
  readonly parts: readonly TaskSessionChatMessagePart[];
  readonly role: "assistant" | "user";
  readonly status: "cancelled" | "complete" | "error" | "running";
  readonly turnId: string;
};

export type TaskSessionChatSnapshot = {
  readonly messages: readonly TaskSessionChatMessage[];
  readonly sessionId: TaskSessionId;
};

type MutableMessage = {
  createdAt: number;
  readonly id: string;
  readonly parts: TaskSessionChatMessagePart[];
  readonly role: "assistant" | "user";
  status: TaskSessionChatMessage["status"];
  readonly turnId: string;
};

export function toTaskSessionChatSnapshot(
  sessionId: TaskSessionId,
  entries: readonly TranscriptEntry[]
): TaskSessionChatSnapshot {
  const messages = new Map<string, MutableMessage>();
  const order: string[] = [];

  for (const entry of entries) {
    if (entry.hidden === true || entry.display === "hidden") {
      continue;
    }

    const message = getMessageForEntry(messages, order, entry);
    if (message == null) {
      continue;
    }

    appendEntryToMessage(message, entry);
  }

  return {
    messages: order.flatMap((id) => {
      const message = messages.get(id);
      if (message == null || message.parts.length === 0) {
        return [];
      }

      return [{
        createdAt: message.createdAt,
        id: message.id,
        parts: message.parts,
        role: message.role,
        status: message.status,
        turnId: message.turnId
      }];
    }),
    sessionId
  };
}

function getMessageForEntry(
  messages: Map<string, MutableMessage>,
  order: string[],
  entry: TranscriptEntry
): MutableMessage | null {
  const turnId = entry.turnId ?? entry._id;
  const role = entry.kind === "user_prompt" ? "user" : "assistant";
  if (!isChatVisibleEntry(entry)) {
    return null;
  }

  const id = `turn:${turnId}:${role}`;
  const existing = messages.get(id);
  if (existing != null) {
    existing.createdAt = Math.min(existing.createdAt, entry.createdAt);
    return existing;
  }

  const message: MutableMessage = {
    createdAt: entry.createdAt,
    id,
    parts: [],
    role,
    status: "running",
    turnId
  };
  messages.set(id, message);
  order.push(id);
  return message;
}

function appendEntryToMessage(message: MutableMessage, entry: TranscriptEntry): void {
  switch (entry.kind) {
    case "assistant_text":
      message.parts.push({
        entryId: entry._id,
        state: stateFromLifecycle(entry.lifecycle),
        text: entry.text,
        type: "text"
      });
      return;
    case "reasoning":
      message.parts.push({
        entryId: entry._id,
        state: stateFromLifecycle(entry.lifecycle),
        text: entry.text,
        type: "reasoning"
      });
      return;
    case "result":
      message.status = entry.subtype === "success"
        ? "complete"
        : entry.subtype === "cancelled"
          ? "cancelled"
          : "error";
      if (entry.isError) {
        message.parts.push({
          entryId: entry._id,
          state: "error",
          text: entry.result,
          type: "status"
        });
      }
      return;
    case "status":
      message.parts.push({
        entryId: entry._id,
        state: stateFromLifecycle(entry.lifecycle),
        text: entry.status,
        type: "status"
      });
      return;
    case "tool_call":
      message.parts.push(toToolCallPart(entry._id, entry.turnId, entry.itemId, entry.tool, {
        ...(entry.display == null ? {} : { display: entry.display }),
        state: stateFromLifecycle(entry.lifecycle)
      }));
      return;
    case "tool_result": {
      const state = entry.isError === true ? "error" : "done";
      message.parts.push({
        entryId: entry._id,
        isError: entry.isError === true,
        output: entry.content,
        state,
        toolCallId: scopedToolCallId(entry.turnId, entry.toolId),
        type: "tool-result"
      });
      return;
    }
    case "user_prompt":
      message.parts.push({
        entryId: entry._id,
        state: "done",
        text: entry.content,
        type: "text"
      });
      message.status = "complete";
      return;
    default:
      return;
  }
}

function toToolCallPart(
  entryId: string,
  turnId: string | undefined,
  itemId: string | undefined,
  tool: NormalizedToolCall,
  options: {
    readonly display?: TranscriptEntryDisplay;
    readonly state: TaskSessionChatPartState;
  }
): TaskSessionChatMessagePart {
  return {
    ...(options.display == null ? {} : { display: options.display }),
    entryId,
    input: tool.input,
    ...(itemId == null ? {} : { providerItemId: itemId }),
    state: options.state,
    toolCallId: scopedToolCallId(turnId, tool.toolId),
    toolKind: tool.toolKind,
    toolName: tool.toolName,
    type: "tool-call"
  };
}

function scopedToolCallId(turnId: string | undefined, toolId: string): string {
  return `turn:${turnId ?? "unknown"}:tool:${toolId}`;
}

function stateFromLifecycle(
  lifecycle: TranscriptEntry["lifecycle"]
): TaskSessionChatPartState {
  return lifecycle === "completed" ? "done" : "running";
}

function isChatVisibleEntry(entry: TranscriptEntry): boolean {
  return entry.kind === "assistant_text"
    || entry.kind === "reasoning"
    || entry.kind === "result"
    || entry.kind === "status"
    || entry.kind === "tool_call"
    || entry.kind === "tool_result"
    || entry.kind === "user_prompt";
}
