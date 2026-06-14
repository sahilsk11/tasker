import {
  AssistantRuntimeProvider,
  AuiIf,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type TextMessagePartComponent,
  type ToolCallMessagePartProps
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  CircleStop,
  Loader2,
  MessageSquarePlus,
  Send,
  Terminal
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelSessionTurn,
  createChatTask,
  createCodexSession,
  fetchTranscript,
  listChatSessions,
  listChatTasks,
  sendSessionMessage,
  sessionEventsUrl,
  type ChatSession,
  type ChatTask,
  type SessionStreamEvent,
  type TranscriptEntry
} from "@/api/chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { transcriptToAssistantMessages } from "./taskerAssistantAdapter";

const DEFAULT_LOCAL_PATH = "/home/sahil/projects/tasker";

export function AssistantChatPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const tasksQuery = useQuery({
    queryFn: listChatTasks,
    queryKey: ["assistant-chat", "tasks"]
  });
  const sessionsQuery = useQuery({
    enabled: selectedTaskId.length > 0,
    queryFn: () => listChatSessions(selectedTaskId),
    queryKey: ["assistant-chat", "sessions", selectedTaskId]
  });

  useEffect(() => {
    if (selectedTaskId.length > 0 || tasksQuery.data == null) {
      return;
    }
    setSelectedTaskId(tasksQuery.data.at(0)?.id ?? "");
  }, [selectedTaskId, tasksQuery.data]);

  useEffect(() => {
    const sessions = sessionsQuery.data;
    if (sessions == null || sessions.some((session) => session.id === selectedSessionId)) {
      return;
    }
    setSelectedSessionId(sessions.at(0)?.id ?? "");
  }, [selectedSessionId, sessionsQuery.data]);

  const selectedSession = sessionsQuery.data?.find(
    (session) => session.id === selectedSessionId
  ) ?? null;

  return (
    <main className="grid h-screen min-h-[42rem] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background text-foreground md:grid-cols-[minmax(18rem,22rem)_1fr] md:grid-rows-1">
      <aside className="flex max-h-[24rem] min-w-0 flex-col border-b border-border bg-card/45 md:max-h-none md:border-b-0 md:border-r">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">Tasker Codex</h1>
              <p className="mt-1 text-xs text-muted-foreground">assistant-ui spike</p>
            </div>
            <Badge variant="accent">Codex</Badge>
          </div>
        </div>
        <ChatSetup
          isCreating={false}
          onCreated={(task, session) => {
            setSelectedTaskId(task.id);
            setSelectedSessionId(session.id);
            void queryClient.invalidateQueries({ queryKey: ["assistant-chat"] });
          }}
        />
        <SessionPicker
          sessions={sessionsQuery.data ?? []}
          selectedSessionId={selectedSessionId}
          onSelect={setSelectedSessionId}
        />
      </aside>
      <section className="min-h-0 min-w-0">
        {selectedSession == null ? (
          <EmptyChatState isLoading={tasksQuery.isLoading || sessionsQuery.isLoading} />
        ) : (
          <TaskerAssistantRuntime session={selectedSession} />
        )}
      </section>
    </main>
  );
}

function ChatSetup({
  onCreated
}: {
  readonly isCreating: boolean;
  readonly onCreated: (task: ChatTask, session: ChatSession) => void;
}): React.JSX.Element {
  const [title, setTitle] = useState("Codex chat");
  const [localPath, setLocalPath] = useState(DEFAULT_LOCAL_PATH);
  const mutation = useMutation({
    mutationFn: async () => {
      const task = await createChatTask(title.trim() || "Codex chat");
      const session = await createCodexSession(task.id, {
        localPath: localPath.trim() || DEFAULT_LOCAL_PATH,
        title: title.trim() || "Codex chat"
      });
      return { session, task };
    },
    onSuccess: ({ session, task }) => onCreated(task, session)
  });

  return (
    <form
      className="grid gap-3 border-b border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Label htmlFor="chat-title">New Codex session</Label>
      <Input
        id="chat-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Input
        aria-label="Working directory"
        value={localPath}
        onChange={(event) => setLocalPath(event.target.value)}
      />
      <Button disabled={mutation.isPending} type="submit">
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquarePlus className="size-4" />}
        New chat
      </Button>
      {mutation.isError ? (
        <p className="text-sm leading-5 text-destructive">{mutation.error.message}</p>
      ) : null}
    </form>
  );
}

function SessionPicker({
  onSelect,
  selectedSessionId,
  sessions
}: {
  readonly onSelect: (sessionId: string) => void;
  readonly selectedSessionId: string;
  readonly sessions: readonly ChatSession[];
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Sessions
      </div>
      <div className="grid gap-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={cn(
              "grid min-w-0 gap-1 rounded-md border p-3 text-left transition-colors",
              selectedSessionId === session.id
                ? "border-accent/60 bg-accent/15"
                : "border-border bg-secondary/25 hover:bg-secondary/60"
            )}
            type="button"
            onClick={() => onSelect(session.id)}
          >
            <span className="truncate text-sm font-medium">{session.title}</span>
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {session.localPath || "No cwd"}
              </span>
              <SessionStatus status={session.status} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskerAssistantRuntime({
  session
}: {
  readonly session: ChatSession;
}): React.JSX.Element {
  const [entries, setEntries] = useState<readonly TranscriptEntry[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const transcriptQuery = useQuery({
    queryFn: () => fetchTranscript(session.id),
    queryKey: ["assistant-chat", "transcript", session.id]
  });

  useEffect(() => {
    setEntries(transcriptQuery.data ?? []);
  }, [session.id, transcriptQuery.data]);

  useEffect(() => {
    setStreamError(null);
    const source = new EventSource(sessionEventsUrl(session.id), { withCredentials: true });
    const onEvent = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as SessionStreamEvent;
      if (parsed.type === "transcript_entry") {
        setEntries((current) => [...current, parsed.entry]);
      } else if (parsed.type === "turn_started") {
        setActiveTurnId(parsed.turnId);
      } else if (parsed.type === "turn_finished" || parsed.type === "turn_failed") {
        setActiveTurnId(null);
      }
    };
    source.addEventListener("transcript_entry", onEvent);
    source.addEventListener("turn_started", onEvent);
    source.addEventListener("turn_finished", onEvent);
    source.addEventListener("turn_failed", onEvent);
    source.onerror = () => setStreamError("Live event stream disconnected.");

    return () => source.close();
  }, [session.id]);

  const messages = useMemo(
    () => transcriptToAssistantMessages(entries, activeTurnId),
    [activeTurnId, entries]
  );
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text.length === 0) {
        return;
      }
      await sendSessionMessage(session.id, text);
    },
    [session.id]
  );
  const onCancel = useCallback(async () => {
    await cancelSessionTurn(session.id);
  }, [session.id]);
  const runtime = useExternalStoreRuntime({
    convertMessage: (message) => message,
    isRunning: activeTurnId != null,
    messages,
    onCancel,
    onNew
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col">
        <ChatHeader
          isLoading={transcriptQuery.isLoading}
          session={session}
          streamError={streamError}
        />
        <ChatScrollViewport stickKey={`${String(messages.length)}:${activeTurnId ?? ""}`}>
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-80 max-w-xl items-center justify-center text-center text-sm leading-6 text-muted-foreground">
              Send a message to start a Codex turn.
            </div>
          ) : null}
          <div className="mx-auto grid w-full max-w-4xl gap-5">
            <ThreadPrimitive.Messages>{() => <ChatMessage />}</ThreadPrimitive.Messages>
          </div>
        </ChatScrollViewport>
        <ChatComposer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function ChatScrollViewport({
  children,
  stickKey
}: {
  readonly children: ReactNode;
  readonly stickKey: string;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }
    ref.current?.scrollTo({
      behavior: "smooth",
      top: ref.current.scrollHeight
    });
  }, [stickKey]);

  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
    >
      {children}
    </div>
  );
}

function ChatHeader({
  isLoading,
  session,
  streamError
}: {
  readonly isLoading: boolean;
  readonly session: ChatSession;
  readonly streamError: string | null;
}): React.JSX.Element {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold">{session.title}</h2>
          <SessionStatus status={session.status} />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{session.localPath}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
        {streamError ?? "Live transcript"}
      </div>
    </header>
  );
}

function ChatMessage(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="grid min-w-0 gap-2">
      <AuiIf condition={(state) => state.message.role === "user"}>
        <div className="ml-auto max-w-[min(42rem,88%)] rounded-lg bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
          <MessagePrimitive.Parts />
        </div>
      </AuiIf>
      <AuiIf condition={(state) => state.message.role === "assistant"}>
        <div className="mr-auto grid max-w-[min(46rem,92%)] gap-3 text-sm leading-6">
          <MessagePrimitive.Parts
            components={{
              Reasoning: ReasoningPart,
              Text: MarkdownPart,
              tools: { Fallback: ToolCallPart }
            }}
          />
        </div>
      </AuiIf>
    </MessagePrimitive.Root>
  );
}

const MarkdownPart: TextMessagePartComponent = () => (
  <MarkdownTextPrimitive
    className="prose prose-invert max-w-none text-sm leading-6"
    components={{
      a: ({ children, href }) => (
        <a className="text-info underline underline-offset-2" href={href}>
          {children}
        </a>
      )
    }}
  />
);

function ReasoningPart({ text }: { readonly text: string }): React.JSX.Element | null {
  if (text.trim().length === 0) {
    return null;
  }
  return (
    <details className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-muted-foreground">
      <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.12em]">
        Thinking
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-xs leading-5">{text}</div>
    </details>
  );
}

function ToolCallPart({
  args,
  isError,
  result,
  status,
  toolName
}: ToolCallMessagePartProps<Record<string, unknown>>): React.JSX.Element {
  const commandValue = args["command"];
  const command = typeof commandValue === "string" ? commandValue : null;
  const output = getToolOutput(result);
  const isRunning = status.type === "running";

  return (
    <details className="rounded-md border border-border bg-[#101113] text-sm" open={false}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <Terminal className="size-4" />
        {toolName === "bash" ? "Bash" : toolName}
        {isRunning ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : null}
      </summary>
      <div className="grid gap-3 border-t border-border p-3">
        {command == null ? (
          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs leading-5">
            {JSON.stringify(args, null, 2)}
          </pre>
        ) : (
          <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-xs leading-5 text-foreground">
            {command}
          </pre>
        )}
        {output != null ? (
          <pre
            className={cn(
              "max-h-72 overflow-auto rounded-md bg-background p-3 font-mono text-xs leading-5",
              isError === true ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {output}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function ChatComposer(): React.JSX.Element {
  const aui = useAui();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (text.length === 0 || isRunning) {
      return;
    }
    aui.thread().append(text);
    setValue("");
  };

  return (
    <div className="border-t border-border bg-background px-4 py-4">
      <form
        className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border border-input bg-secondary/45 p-2 focus-within:ring-2 focus-within:ring-ring/35"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          className="max-h-44 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Message Codex"
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button
          aria-label="Stop"
          disabled={!isRunning}
          size="icon"
          variant="outline"
          onClick={() => aui.thread().cancelRun()}
        >
            <CircleStop className="size-4" />
        </Button>
        <Button aria-label="Send" disabled={isRunning || value.trim().length === 0} size="icon" type="submit">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function EmptyChatState({ isLoading }: { readonly isLoading: boolean }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {isLoading ? "Loading Codex sessions..." : "Create a Codex chat to start."}
    </div>
  );
}

function SessionStatus({
  status
}: {
  readonly status: ChatSession["status"];
}): React.JSX.Element {
  const active = status === "running" || status === "starting";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-medium",
        active
          ? "border-info/40 bg-info/10 text-info"
          : "border-border bg-secondary text-muted-foreground"
      )}
    >
      {active ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className="size-3" />}
      {status}
    </span>
  );
}

function getToolOutput(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }

  if (result != null && typeof result === "object") {
    const output = (result as { readonly output?: unknown }).output;
    if (typeof output === "string") {
      return output;
    }
    return JSON.stringify(result, null, 2);
  }

  return null;
}
