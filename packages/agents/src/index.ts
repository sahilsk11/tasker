import {
  spawn,
  type ChildProcessByStdio
} from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { AgentProvider, RunEvent } from "@tasker/core";

type AgentChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export type LocalAgentCommand = {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly provider: AgentProvider;
  readonly taskId: string;
};

export type LocalAgentSession = {
  readonly cancel: () => void;
  readonly done: Promise<LocalAgentResult>;
  readonly events: AsyncIterable<RunEvent>;
  readonly pid: number | undefined;
};

export type LocalAgentResult = {
  readonly code: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
};

export function spawnLocalAgentSession(input: LocalAgentCommand): LocalAgentSession {
  const child = spawn(input.command, [...input.args], {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...input.env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const done = waitForExit(child);

  const events = streamProcessEvents(input, child, done);

  return {
    cancel: () => {
      child.kill("SIGTERM");
    },
    done,
    events,
    pid: child.pid
  };
}

async function* streamProcessEvents(
  input: LocalAgentCommand,
  child: AgentChildProcess,
  done: Promise<LocalAgentResult>
): AsyncIterable<RunEvent> {
  const queue: RunEvent[] = [];
  const state = { isClosed: false };
  let wake: (() => void) | undefined;

  const enqueue = (event: RunEvent): void => {
    queue.push(event);
    wake?.();
    wake = undefined;
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    enqueueLines(input.taskId, "stdout", chunk, enqueue);
  });
  child.stderr.on("data", (chunk: string) => {
    enqueueLines(input.taskId, "stderr", chunk, enqueue);
  });

  void done.then(() => {
    state.isClosed = true;
    wake?.();
    wake = undefined;
  });

  yield makeEvent(input.taskId, "status", `${input.provider} session started`);

  while (!state.isClosed || queue.length !== 0) {
    const next = queue.shift();

    if (next != null) {
      yield next;
      continue;
    }

    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  const result = await done;
  const status = result.code === 0 ? "completed" : "failed";
  yield makeEvent(input.taskId, "status", `${input.provider} session ${status}`);
}

function enqueueLines(
  taskId: string,
  type: "stdout" | "stderr",
  chunk: string,
  enqueue: (event: RunEvent) => void
): void {
  const lines = chunk.split(/\r?\n/u).filter((line) => line.length > 0);

  for (const line of lines) {
    enqueue(makeEvent(taskId, type, line));
  }
}

function waitForExit(child: AgentChildProcess): Promise<LocalAgentResult> {
  return new Promise((resolve) => {
    child.once("close", (code, signal) => {
      resolve({
        code: code ?? undefined,
        signal: signal ?? undefined
      });
    });
  });
}

function makeEvent(
  taskId: string,
  type: RunEvent["type"],
  message: string
): RunEvent {
  return {
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    message,
    taskId,
    type
  };
}
