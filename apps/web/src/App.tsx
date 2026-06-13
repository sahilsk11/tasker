import { createTaskSchema, type Task } from "@tasker/core";
import { useMemo, useState } from "react";

const initialTasks: Task[] = [];

export function App(): React.JSX.Element {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("codex");
  const canSubmit = useMemo(() => {
    return createTaskSchema.safeParse({
      prompt,
      provider: selectedProvider,
      title
    }).success;
  }, [prompt, selectedProvider, title]);

  async function submitTask(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    const response = await fetch("/api/tasks", {
      body: JSON.stringify({
        prompt,
        provider: selectedProvider,
        title
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Failed to create task: ${String(response.status)}`);
    }

    const body = await response.json() as { task: Task };
    setTasks((current) => [body.task, ...current]);
    setTitle("");
    setPrompt("");
  }

  return (
    <main className="shell">
      <section className="task-form" aria-labelledby="new-task-title">
        <div>
          <h1 id="new-task-title">tasker</h1>
          <p>Delegate coding work to local agent sessions and track the artifacts.</p>
        </div>

        <label>
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Fix the failing checkout tests"
          />
        </label>

        <label>
          <span>Agent</span>
          <select
            value={selectedProvider}
            onChange={(event) => setSelectedProvider(event.target.value)}
          >
            <option value="codex">Codex</option>
            <option value="opencode">OpenCode</option>
            <option value="cursor">Cursor</option>
          </select>
        </label>

        <label>
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the work, verification expectations, and artifact output."
            rows={8}
          />
        </label>

        <button type="button" disabled={!canSubmit} onClick={() => void submitTask()}>
          Create task
        </button>
      </section>

      <section className="task-list" aria-label="Tasks">
        {tasks.length === 0 ? (
          <div className="empty">No tasks yet.</div>
        ) : (
          tasks.map((task) => (
            <article key={task.id} className="task-row">
              <div>
                <h2>{task.title}</h2>
                <p>{task.prompt}</p>
              </div>
              <span>{task.status}</span>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
