import { spawnLocalAgentSession } from "@tasker/agents";

const session = spawnLocalAgentSession({
  args: [
    "--eval",
    "console.info('worker ready for local agent sessions')"
  ],
  command: process.execPath,
  cwd: process.cwd(),
  provider: "codex",
  taskId: "00000000-0000-4000-8000-000000000000"
});

for await (const event of session.events) {
  console.info(`[${event.type}] ${event.message}`);
}

const result = await session.done;
console.info(`worker probe exited with code ${String(result.code ?? "unknown")}`);
