import type {
  ThreadAssistantMessagePart,
  ThreadMessageLike,
  ToolCallMessagePart
} from "@assistant-ui/react";
import type { TranscriptEntry } from "@/api/chat";

type TurnGroup = {
  assistantEntries: TranscriptEntry[];
  result: Extract<TranscriptEntry, { kind: "result" }> | null;
  turnId: string;
  user: Extract<TranscriptEntry, { kind: "user_prompt" }>;
};

const ASSISTANT_KINDS = new Set([
  "assistant_text",
  "context_window_updated",
  "interrupted",
  "reasoning",
  "status",
  "system_init",
  "tool_call",
  "tool_result"
]);

export function coalesceTranscriptEntries(
  entries: readonly TranscriptEntry[]
): readonly TranscriptEntry[] {
  const ordered = [...entries].sort(compareEntries);
  const result: TranscriptEntry[] = [];
  const indexes = new Map<string, number>();

  for (const entry of ordered) {
    const key = coalesceKey(entry);
    if (key == null) {
      result.push(entry);
      continue;
    }

    const index = indexes.get(key);
    if (index == null) {
      indexes.set(key, result.length);
      result.push(entry);
    } else {
      result[index] = entry;
    }
  }

  return result.sort(compareEntries);
}

export function transcriptToAssistantMessages(
  entries: readonly TranscriptEntry[],
  activeTurnId: string | null
): readonly ThreadMessageLike[] {
  const groups = groupTranscriptTurns(coalesceTranscriptEntries(entries));
  return groups.flatMap((group) => {
    const userMessage: ThreadMessageLike = {
      content: [{ text: group.user.content, type: "text" }],
      createdAt: new Date(group.user.createdAt),
      id: `user:${group.turnId}`,
      role: "user"
    };
    const assistantMessage = makeAssistantMessage(group, activeTurnId);
    return assistantMessage == null ? [userMessage] : [userMessage, assistantMessage];
  });
}

function groupTranscriptTurns(entries: readonly TranscriptEntry[]): readonly TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;

  for (const entry of entries) {
    if (entry.hidden === true) {
      continue;
    }

    if (entry.kind === "user_prompt") {
      current = {
        assistantEntries: [],
        result: null,
        turnId: entry.turnId ?? entry._id,
        user: entry
      };
      groups.push(current);
      continue;
    }

    if (current == null || !ASSISTANT_KINDS.has(entry.kind)) {
      continue;
    }

    if (entry.kind === "result") {
      current.result = entry;
    } else if (entry.kind !== "system_init" && entry.kind !== "context_window_updated") {
      current.assistantEntries.push(entry);
    }
  }

  return groups;
}

function makeAssistantMessage(
  group: TurnGroup,
  activeTurnId: string | null
): ThreadMessageLike | null {
  const content = group.assistantEntries.flatMap((entry) =>
    transcriptEntryToParts(entry, group.assistantEntries, group.turnId)
  );
  const isRunning = activeTurnId === group.turnId && group.result == null;

  if (content.length === 0 && !isRunning && group.result?.isError !== true) {
    return null;
  }

  const messageContent = content.length > 0
    ? content
    : [{ text: "", type: "text" as const }];

  return {
    content: messageContent,
    createdAt: new Date(group.user.createdAt),
    id: `assistant:${group.turnId}`,
    role: "assistant",
    status: getAssistantStatus(group.result, isRunning)
  };
}

function transcriptEntryToParts(
  entry: TranscriptEntry,
  entries: readonly TranscriptEntry[],
  turnId: string
): readonly ThreadAssistantMessagePart[] {
  switch (entry.kind) {
    case "assistant_text":
      return entry.text.length === 0 ? [] : [{ text: entry.text, type: "text" }];
    case "reasoning":
      return entry.text.length === 0 ? [] : [{ text: entry.text, type: "reasoning" }];
    case "status":
      return [{ text: entry.status, type: "reasoning" }];
    case "interrupted":
      return [{
        text: entry.detail ?? "Interrupted",
        type: "reasoning"
      }];
    case "tool_call":
      return [toToolCallPart(entry, findToolResult(entries, entry, turnId), turnId)];
    default:
      return [];
  }
}

function toToolCallPart(
  entry: Extract<TranscriptEntry, { kind: "tool_call" }>,
  result: Extract<TranscriptEntry, { kind: "tool_result" }> | null,
  turnId: string
): ToolCallMessagePart {
  const args = entry.tool.input as ToolCallMessagePart["args"];
  return {
    args,
    argsText: JSON.stringify(args),
    isError: result?.isError,
    result: result?.content,
    type: "tool-call",
    toolCallId: toolIdentity(turnId, entry.tool.toolId),
    toolName: entry.tool.toolKind
  };
}

function findToolResult(
  entries: readonly TranscriptEntry[],
  call: Extract<TranscriptEntry, { kind: "tool_call" }>,
  turnId: string
): Extract<TranscriptEntry, { kind: "tool_result" }> | null {
  return entries.find((entry) =>
    entry.kind === "tool_result"
    && toolIdentity(entry.turnId ?? turnId, entry.toolId) === toolIdentity(turnId, call.tool.toolId)
  ) as Extract<TranscriptEntry, { kind: "tool_result" }> | undefined ?? null;
}

function getAssistantStatus(
  result: Extract<TranscriptEntry, { kind: "result" }> | null,
  isRunning: boolean
): ThreadMessageLike["status"] {
  if (isRunning) {
    return { type: "running" };
  }

  if (result?.subtype === "cancelled") {
    return { reason: "cancelled", type: "incomplete" };
  }

  if (result?.isError === true) {
    return { error: result.result, reason: "error", type: "incomplete" };
  }

  return { reason: "stop", type: "complete" };
}

function coalesceKey(entry: TranscriptEntry): string | null {
  if (entry.kind === "tool_result") {
    return `${entry.turnId ?? "no-turn"}:tool_result:${entry.toolId}`;
  }

  if (
    entry.kind === "assistant_text"
    || entry.kind === "reasoning"
    || entry.kind === "status"
    || entry.kind === "tool_call"
  ) {
    const itemId = entry.itemId;
    return itemId == null ? null : `${entry.turnId ?? "no-turn"}:${entry.kind}:${itemId}`;
  }

  return null;
}

function compareEntries(left: TranscriptEntry, right: TranscriptEntry): number {
  return (left.sequence ?? Number.MAX_SAFE_INTEGER)
    - (right.sequence ?? Number.MAX_SAFE_INTEGER)
    || left.createdAt - right.createdAt;
}

function toolIdentity(turnId: string, itemId: string): string {
  return `${turnId}:${itemId}`;
}
