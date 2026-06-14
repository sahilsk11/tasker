export type AskUserQuestionOption = {
  readonly description?: string;
  readonly label: string;
};

export type AskUserQuestionItem = {
  readonly header?: string;
  readonly id?: string;
  readonly multiSelect?: boolean;
  readonly options?: readonly AskUserQuestionOption[];
  readonly question: string;
};

export type AskUserQuestionAnswerMap = Record<string, readonly string[]>;

export type AskUserQuestionToolResult = {
  readonly answers: AskUserQuestionAnswerMap;
  readonly discarded?: boolean;
};

export type ExitPlanModeToolResult = {
  readonly clearContext?: boolean;
  readonly confirmed?: boolean;
  readonly discarded?: boolean;
  readonly message?: string;
};

export type TodoItem = {
  readonly activeForm: string;
  readonly content: string;
  readonly status: "completed" | "in_progress" | "pending";
};

export type ToolCallBase<TKind extends string, TInput> = {
  readonly input: TInput;
  readonly kind: "tool";
  readonly rawInput?: Readonly<Record<string, unknown>>;
  readonly toolId: string;
  readonly toolKind: TKind;
  readonly toolName: string;
};

export type AskUserQuestionToolCall = ToolCallBase<
  "ask_user_question",
  { readonly questions: readonly AskUserQuestionItem[] }
>;

export type ExitPlanModeToolCall = ToolCallBase<
  "exit_plan_mode",
  { readonly plan?: string; readonly summary?: string }
>;

export type TodoWriteToolCall = ToolCallBase<
  "todo_write",
  { readonly todos: readonly TodoItem[] }
>;

export type SkillToolCall = ToolCallBase<"skill", { readonly skill: string }>;
export type GlobToolCall = ToolCallBase<"glob", { readonly pattern: string }>;

export type GrepToolCall = ToolCallBase<
  "grep",
  { readonly outputMode?: string; readonly pattern: string }
>;

export type BashToolCall = ToolCallBase<
  "bash",
  {
    readonly command: string;
    readonly description?: string;
    readonly runInBackground?: boolean;
    readonly timeoutMs?: number;
  }
>;

export type WebSearchToolCall = ToolCallBase<"web_search", { readonly query: string }>;
export type ReadFileToolCall = ToolCallBase<"read_file", { readonly filePath: string }>;

export type WriteFileToolCall = ToolCallBase<
  "write_file",
  { readonly content: string; readonly filePath: string }
>;

export type EditFileToolCall = ToolCallBase<
  "edit_file",
  {
    readonly filePath: string;
    readonly newString: string;
    readonly oldString: string;
  }
>;

export type DeleteFileToolCall = ToolCallBase<
  "delete_file",
  { readonly content: string; readonly filePath: string }
>;

export type SubagentTaskToolCall = ToolCallBase<
  "subagent_task",
  { readonly subagentType?: string }
>;

export type McpGenericToolCall = ToolCallBase<
  "mcp_generic",
  {
    readonly payload: Readonly<Record<string, unknown>>;
    readonly server: string;
    readonly tool: string;
  }
>;

export type UnknownToolCall = ToolCallBase<
  "unknown_tool",
  { readonly payload: Readonly<Record<string, unknown>> }
>;

export type NormalizedToolCall =
  | AskUserQuestionToolCall
  | BashToolCall
  | DeleteFileToolCall
  | EditFileToolCall
  | ExitPlanModeToolCall
  | GlobToolCall
  | GrepToolCall
  | McpGenericToolCall
  | ReadFileToolCall
  | SkillToolCall
  | SubagentTaskToolCall
  | TodoWriteToolCall
  | UnknownToolCall
  | WebSearchToolCall
  | WriteFileToolCall;

export type PendingUserToolCall = NormalizedToolCall & {
  readonly toolKind: "ask_user_question" | "exit_plan_mode";
};
