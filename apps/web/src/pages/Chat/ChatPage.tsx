import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Terminal,
  Wrench
} from "lucide-react";
import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createChatTask,
  createCodexSession,
  getSessionTranscript,
  openSessionEventSource,
  sendSessionMessage,
  type SessionStreamEvent,
  type TranscriptEntry
} from "@/api/chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api";
import { defaultChatLocalPath } from "@/lib/env";
import {
  getTodos,
  getToolResultText,
  getToolSummary,
  hydrateTranscript,
  type ChatTranscriptItem
} from "./transcript";

const STORAGE_KEY = "tasker.codexChat.v1";

type StoredChat = {
  readonly localPath: string;
  readonly sessionId: string;
  readonly taskId: string;
};

export function ChatPage(): React.JSX.Element {
  const [storedChat, setStoredChat] = useState<StoredChat | null>(() => readStoredChat());
  const [localPath, setLocalPath] = useState(storedChat?.localPath ?? defaultChatLocalPath);
  const [entries, setEntries] = useState<readonly TranscriptEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const sessionId = storedChat?.sessionId ?? null;

  const transcriptQuery = useQuery({
    enabled: sessionId != null,
    queryFn: () => getSessionTranscript(sessionId ?? ""),
    queryKey: ["session-transcript", sessionId]
  });

  useEffect(() => {
    if (transcriptQuery.data != null) {
      setEntries(transcriptQuery.data);
    }
  }, [transcriptQuery.data]);

  useEffect(() => {
    if (sessionId == null) {
      return;
    }

    const source = openSessionEventSource(sessionId);
    setStreamError(null);

    source.addEventListener("transcript_entry", (event) => {
      const parsed = parseStreamEvent(event);
      if (parsed?.type === "transcript_entry") {
        setEntries((current) => upsertEntry(current, parsed.entry));
      }
    });
    source.addEventListener("turn_started", () => setIsRunning(true));
    source.addEventListener("turn_finished", () => setIsRunning(false));
    source.addEventListener("turn_failed", (event) => {
      setIsRunning(false);
      const parsed = parseStreamEvent(event);
      setStreamError(parsed?.type === "turn_failed" ? parsed.message : "Turn failed");
    });
    source.onerror = () => setStreamError("Live stream disconnected");

    return () => source.close();
  }, [sessionId]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const task = await createChatTask();
      const session = await createCodexSession(task.id, {
        localPath: localPath.trim()
      });
      return { session, taskId: task.id };
    },
    onSuccess: ({ session, taskId }) => {
      const next = {
        localPath: localPath.trim(),
        sessionId: session.id,
        taskId
      };
      writeStoredChat(next);
      setStoredChat(next);
      setEntries([]);
      setIsRunning(false);
      setStreamError(null);
    }
  });

  function handleNewChat(): void {
    clearStoredChat();
    setStoredChat(null);
    setEntries([]);
    setIsRunning(false);
    setStreamError(null);
  }

  const canStart = localPath.trim().length > 0 && !createSessionMutation.isPending;
  const errorMessage =
    createSessionMutation.isError ? getErrorMessage(createSessionMutation.error) : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr] px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/60">
              <MessageSquareText className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">
                Codex chat
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                Detached Tasker session
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Tasks</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <Plus className="size-4" />
              New
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 gap-4 py-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="min-h-0 rounded-lg border border-border bg-card/70 p-4">
            <SessionPanel
              canStart={canStart}
              errorMessage={errorMessage}
              isCreating={createSessionMutation.isPending}
              isRunning={isRunning}
              localPath={localPath}
              sessionId={sessionId}
              streamError={streamError}
              onLocalPathChange={setLocalPath}
              onStart={() => void createSessionMutation.mutateAsync()}
            />
          </aside>

          <section className="grid min-h-[calc(100dvh-11rem)] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-border bg-card/70">
            <TranscriptPane
              entries={entries}
              isLoading={transcriptQuery.isLoading}
              isRunning={isRunning}
              sessionId={sessionId}
            />
            <Composer
              disabled={sessionId == null || isRunning}
              sessionId={sessionId}
              onSendStarted={() => setIsRunning(true)}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function SessionPanel({
  canStart,
  errorMessage,
  isCreating,
  isRunning,
  localPath,
  onLocalPathChange,
  onStart,
  sessionId,
  streamError
}: {
  readonly canStart: boolean;
  readonly errorMessage: string | null;
  readonly isCreating: boolean;
  readonly isRunning: boolean;
  readonly localPath: string;
  readonly onLocalPathChange: (value: string) => void;
  readonly onStart: () => void;
  readonly sessionId: string | null;
  readonly streamError: string | null;
}): React.JSX.Element {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Session</span>
        <Badge variant={isRunning ? "default" : "secondary"}>
          {isRunning ? "Running" : sessionId == null ? "Not started" : "Idle"}
        </Badge>
      </div>
      <div className="grid gap-2">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Working directory
        </label>
        <Input
          value={localPath}
          onChange={(event) => onLocalPathChange(event.target.value)}
          disabled={sessionId != null || isCreating}
        />
      </div>
      {sessionId == null ? (
        <Button disabled={!canStart} onClick={onStart}>
          {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
          Start Codex chat
        </Button>
      ) : (
        <div className="rounded-md border border-border bg-secondary/35 p-3 text-xs leading-5 text-muted-foreground">
          <div className="font-mono text-foreground">{sessionId}</div>
          This browser will reuse the session until you start a new chat.
        </div>
      )}
      {errorMessage != null ? <InlineError message={errorMessage} /> : null}
      {streamError != null ? <InlineError message={streamError} /> : null}
    </div>
  );
}

function TranscriptPane({
  entries,
  isLoading,
  isRunning,
  sessionId
}: {
  readonly entries: readonly TranscriptEntry[];
  readonly isLoading: boolean;
  readonly isRunning: boolean;
  readonly sessionId: string | null;
}): React.JSX.Element {
  const items = useMemo(() => hydrateTranscript(entries), [entries]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element == null) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [items.length, isRunning]);

  if (sessionId == null) {
    return <EmptyTranscript title="Start a Codex chat to stream a real Tasker session." />;
  }

  if (isLoading) {
    return <EmptyTranscript title="Loading transcript..." />;
  }

  return (
    <div ref={scrollRef} className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
      {items.length === 0 ? (
        <EmptyTranscript title="Send a message to see Codex work here." />
      ) : (
        <div className="mx-auto grid w-full max-w-3xl gap-4">
          {items.map((item) => (
            <TranscriptItem key={item.id} item={item} />
          ))}
          {isRunning ? <RunningIndicator /> : null}
        </div>
      )}
    </div>
  );
}

function TranscriptItem({
  item
}: {
  readonly item: ChatTranscriptItem;
}): React.JSX.Element | null {
  switch (item.kind) {
    case "assistant":
      return <AssistantMessage text={item.text} lifecycle={item.lifecycle} />;
    case "reasoning":
      return <ReasoningMessage text={item.text} lifecycle={item.lifecycle} />;
    case "result":
      return item.isError ? <InlineError message={item.result} /> : null;
    case "status":
      return <StatusMessage text={item.status} />;
    case "tool":
      return <ToolMessage item={item} />;
    case "user":
      return <UserMessage text={item.content} />;
  }
}

function UserMessage({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(42rem,88%)] rounded-lg bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AssistantMessage({
  lifecycle,
  text
}: {
  readonly lifecycle?: string | undefined;
  readonly text: string;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 gap-3">
      <Avatar icon={Bot} />
      <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
        {text.length > 0 ? text : lifecycle === "completed" ? "" : "Writing..."}
      </div>
    </div>
  );
}

function ReasoningMessage({
  lifecycle,
  text
}: {
  readonly lifecycle?: string | undefined;
  readonly text: string;
}): React.JSX.Element {
  return (
    <details className="group rounded-md border border-border bg-secondary/25" open={lifecycle !== "completed"}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <ChevronRight className="size-4 group-open:hidden" />
        <ChevronDown className="hidden size-4 group-open:block" />
        Thinking
        {lifecycle === "completed" ? <Badge variant="secondary">Done</Badge> : null}
      </summary>
      <div className="whitespace-pre-wrap border-t border-border px-3 py-2 text-sm leading-6 text-muted-foreground">
        {text.length > 0 ? text : "Working through the next step..."}
      </div>
    </details>
  );
}

function ToolMessage({ item }: { readonly item: Extract<ChatTranscriptItem, { readonly kind: "tool" }> }): React.JSX.Element {
  const isDone = item.lifecycle === "completed" || item.result != null;
  const resultText = getToolResultText(item.result);
  const todos = getTodos(item.tool);
  const Icon = item.tool.toolKind === "bash" ? Terminal : Wrench;

  return (
    <details className="group rounded-md border border-border bg-secondary/25" open={!isDone}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
        <ChevronRight className="size-4 text-muted-foreground group-open:hidden" />
        <ChevronDown className="hidden size-4 text-muted-foreground group-open:block" />
        <Icon className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{item.tool.toolName}</span>
        <Badge variant={item.result?.isError === true ? "destructive" : "secondary"}>
          {isDone ? "Done" : "Running"}
        </Badge>
      </summary>
      <div className="grid gap-3 border-t border-border px-3 py-3">
        <pre className="overflow-x-auto rounded-md bg-background/70 p-3 font-mono text-xs leading-5 text-foreground">
          {getToolSummary(item.tool)}
        </pre>
        {todos.length > 0 ? <TodoList todos={todos} /> : null}
        {resultText != null && resultText.length > 0 ? (
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background/70 p-3 font-mono text-xs leading-5 text-muted-foreground">
            {resultText}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function TodoList({ todos }: { readonly todos: ReturnType<typeof getTodos> }): React.JSX.Element {
  return (
    <div className="grid gap-2">
      {todos.map((todo) => {
        const Icon = todo.status === "completed"
          ? CheckCircle2
          : todo.status === "in_progress"
            ? CircleDashed
            : Circle;
        return (
          <div key={todo.content} className="flex min-w-0 items-center gap-2 text-sm">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{todo.content}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusMessage({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-secondary/25 px-3 py-2 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Composer({
  disabled,
  onSendStarted,
  sessionId
}: {
  readonly disabled: boolean;
  readonly onSendStarted: () => void;
  readonly sessionId: string | null;
}): React.JSX.Element {
  const [content, setContent] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (sessionId == null) {
        throw new Error("Start a Codex chat first");
      }
      return sendSessionMessage(sessionId, content.trim());
    },
    onSuccess: () => {
      setContent("");
      onSendStarted();
    }
  });
  const canSend = !disabled && !mutation.isPending && content.trim().length > 0;

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    await mutation.mutateAsync();
  }

  return (
    <form className="border-t border-border bg-card p-3 sm:p-4" onSubmit={(event) => void handleSubmit(event)}>
      <div className="mx-auto grid max-w-3xl gap-2">
        {mutation.isError ? <InlineError message={getErrorMessage(mutation.error)} /> : null}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={disabled ? "Codex is running..." : "Message Codex"}
            className="min-h-14 resize-none"
            disabled={sessionId == null}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!canSend} aria-label="Send message">
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RunningIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Codex is working
    </div>
  );
}

function EmptyTranscript({ title }: { readonly title: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {title}
    </div>
  );
}

function Avatar({ icon: Icon }: { readonly icon: typeof Bot }): React.JSX.Element {
  return (
    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/60">
      <Icon className="size-4 text-muted-foreground" />
    </div>
  );
}

function InlineError({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

function upsertEntry(
  current: readonly TranscriptEntry[],
  entry: TranscriptEntry
): readonly TranscriptEntry[] {
  return current.some((item) => item._id === entry._id)
    ? current.map((item) => item._id === entry._id ? entry : item)
    : [...current, entry];
}

function parseStreamEvent(event: Event): SessionStreamEvent | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null;
  }

  try {
    return JSON.parse(event.data) as SessionStreamEvent;
  } catch {
    return null;
  }
}

function readStoredChat(): StoredChat | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredChat>;
    return typeof parsed.sessionId === "string"
      && typeof parsed.taskId === "string"
      && typeof parsed.localPath === "string"
      ? {
          localPath: parsed.localPath,
          sessionId: parsed.sessionId,
          taskId: parsed.taskId
        }
      : null;
  } catch {
    return null;
  }
}

function writeStoredChat(chat: StoredChat): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chat));
}

function clearStoredChat(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
