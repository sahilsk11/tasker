import type { NormalizedToolCall, TodoItem, TranscriptEntry } from "@/api/chat";

export type ChatTranscriptItem =
  | {
      readonly createdAt: number;
      readonly id: string;
      readonly kind: "assistant";
      readonly lifecycle?: string | undefined;
      readonly text: string;
    }
  | {
      readonly createdAt: number;
      readonly id: string;
      readonly kind: "reasoning";
      readonly lifecycle?: string | undefined;
      readonly text: string;
    }
  | {
      readonly createdAt: number;
      readonly id: string;
      readonly kind: "result";
      readonly isError: boolean;
      readonly result: string;
      readonly subtype: string;
    }
  | {
      readonly createdAt: number;
      readonly id: string;
      readonly kind: "status";
      readonly status: string;
    }
  | {
      readonly createdAt: number;
      readonly id: string;
      readonly kind: "tool";
      readonly lifecycle?: string | undefined;
      readonly result?: ToolResultView | undefined;
      readonly tool: NormalizedToolCall;
    }
  | {
      readonly createdAt: number;
      readonly content: string;
      readonly id: string;
      readonly kind: "user";
    };

export type ToolResultView = {
  readonly content: unknown;
  readonly isError: boolean;
};

export function hydrateTranscript(
  entries: readonly TranscriptEntry[]
): readonly ChatTranscriptItem[] {
  const items = new Map<string, ChatTranscriptItem>();
  const order: string[] = [];

  for (const entry of entries) {
    if (entry.hidden === true || entry.display === "hidden") {
      continue;
    }

    const hydrated = hydrateEntry(entry, items);
    if (hydrated == null) {
      continue;
    }

    if (!items.has(hydrated.id)) {
      order.push(hydrated.id);
    }
    items.set(hydrated.id, hydrated);
  }

  return order.flatMap((id) => {
    const item = items.get(id);
    if (item == null || shouldHideItem(item)) {
      return [];
    }
    return [item];
  });
}

export function getToolSummary(tool: NormalizedToolCall): string {
  switch (tool.toolKind) {
    case "bash":
      return getString(tool.input["command"]) ?? "Run shell command";
    case "mcp_generic": {
      const server = getString(tool.input["server"]);
      const name = getString(tool.input["tool"]) ?? tool.toolName;
      return server == null ? name : `${server}.${name}`;
    }
    case "todo_write":
      return `${String(getTodos(tool).length)} todos`;
    case "web_search":
      return getString(tool.input["query"]) ?? "Search the web";
    default:
      return tool.toolName;
  }
}

export function getToolResultText(result: ToolResultView | undefined): string | null {
  if (result == null) {
    return null;
  }

  const content = result.content;
  if (typeof content === "string") {
    return content;
  }

  if (isRecord(content)) {
    const output = getString(content["output"]);
    if (output != null) {
      return output;
    }
  }

  return JSON.stringify(content, null, 2);
}

export function getTodos(tool: NormalizedToolCall): readonly TodoItem[] {
  const todos = tool.input["todos"];
  return Array.isArray(todos) ? todos.filter(isTodoItem) : [];
}

function hydrateEntry(
  entry: TranscriptEntry,
  items: ReadonlyMap<string, ChatTranscriptItem>
): ChatTranscriptItem | null {
  switch (entry.kind) {
    case "assistant_text":
      return {
        createdAt: entry.createdAt,
        id: itemKey("assistant", entry),
        kind: "assistant",
        lifecycle: entry.lifecycle,
        text: getString(entry["text"]) ?? ""
      };
    case "reasoning":
      return {
        createdAt: entry.createdAt,
        id: itemKey("reasoning", entry),
        kind: "reasoning",
        lifecycle: entry.lifecycle,
        text: getString(entry["text"]) ?? ""
      };
    case "result":
      return {
        createdAt: entry.createdAt,
        id: entry._id,
        isError: getBoolean(entry["isError"]),
        kind: "result",
        result: getString(entry["result"]) ?? "",
        subtype: getString(entry["subtype"]) ?? "success"
      };
    case "status":
      return {
        createdAt: entry.createdAt,
        id: entry._id,
        kind: "status",
        status: getString(entry["status"]) ?? "Status update"
      };
    case "system_init":
      return null;
    case "tool_call":
      return {
        createdAt: entry.createdAt,
        id: itemKey("tool", entry),
        kind: "tool",
        lifecycle: entry.lifecycle,
        result: getExistingToolResult(items, itemKey("tool", entry)),
        tool: normalizeTool(entry["tool"])
      };
    case "tool_result":
      return mergeToolResult(entry, items);
    case "user_prompt":
      return {
        content: getString(entry["content"]) ?? "",
        createdAt: entry.createdAt,
        id: entry._id,
        kind: "user"
      };
    default:
      return null;
  }
}

function mergeToolResult(
  entry: TranscriptEntry,
  items: ReadonlyMap<string, ChatTranscriptItem>
): ChatTranscriptItem | null {
  const toolId = getString(entry["toolId"]) ?? entry.itemId;
  if (toolId == null) {
    return null;
  }

  const id = `tool:${toolId}`;
  const existing = items.get(id);
  const result = {
    content: entry["content"],
    isError: getBoolean(entry["isError"])
  };

  if (existing?.kind === "tool") {
    return {
      ...existing,
      createdAt: entry.createdAt,
      lifecycle: entry.lifecycle ?? existing.lifecycle,
      result
    };
  }

  return null;
}

function getExistingToolResult(
  items: ReadonlyMap<string, ChatTranscriptItem>,
  id: string
): ToolResultView | undefined {
  const existing = items.get(id);
  return existing?.kind === "tool" ? existing.result : undefined;
}

function shouldHideItem(item: ChatTranscriptItem): boolean {
  return item.kind === "result" && !item.isError;
}

function itemKey(prefix: string, entry: TranscriptEntry): string {
  return `${prefix}:${entry.itemId ?? entry.messageId ?? entry._id}`;
}

function normalizeTool(value: unknown): NormalizedToolCall {
  if (!isRecord(value)) {
    return {
      input: {},
      toolId: "unknown",
      toolKind: "unknown_tool",
      toolName: "Tool"
    };
  }

  return {
    input: isRecord(value["input"]) ? value["input"] : {},
    rawInput: isRecord(value["rawInput"]) ? value["rawInput"] : undefined,
    toolId: getString(value["toolId"]) ?? "unknown",
    toolKind: getString(value["toolKind"]) ?? "unknown_tool",
    toolName: getString(value["toolName"]) ?? "Tool"
  };
}

function isTodoItem(value: unknown): value is TodoItem {
  return isRecord(value)
    && typeof value["content"] === "string"
    && (value["status"] === "completed"
      || value["status"] === "in_progress"
      || value["status"] === "pending");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
