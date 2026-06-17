import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  AcceptTaskBreakdownResult,
  TaskBreakdown,
  TaskBreakdownSourceInput,
  TaskBreakdownValidationError,
  TaskBreakdownValidationResult,
  TaskBreakdownWarning
} from "../domain/task-breakdown.js";
import type { Task, TaskId } from "../domain/task.js";
import type { TaskRepository } from "../repository/task.repository.js";
import { BadRequestError, NotFoundError } from "./errors.js";

const breakdownItemSchema = z.object({
  dependsOn: z.array(z.string().min(1)).default([]),
  description: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1)
});

const breakdownSchema = z.object({
  items: z.array(breakdownItemSchema).min(1),
  schemaVersion: z.literal(1),
  summary: z.string().min(1),
  taskId: z.string().min(1)
});

export class TaskBreakdownService {
  public constructor(
    private readonly tasks: TaskRepository,
    private readonly publicApiBaseUrl: string
  ) {}

  public async validate(
    input: TaskBreakdownSourceInput
  ): Promise<TaskBreakdownValidationResult> {
    const source = await this.loadBreakdown(input);
    if (source.errors.length > 0 || source.breakdown == null) {
      return {
        breakdown: null,
        errors: source.errors,
        previewUrl: null,
        valid: false,
        warnings: []
      };
    }

    const semantic = await this.validateBreakdown(source.breakdown);

    return {
      breakdown: semantic.errors.length === 0 ? source.breakdown : null,
      errors: semantic.errors,
      previewUrl:
        semantic.errors.length === 0 && source.uri != null
          ? this.buildPreviewUrl(source.uri)
          : null,
      valid: semantic.errors.length === 0,
      warnings: semantic.warnings
    };
  }

  public async accept(
    input: TaskBreakdownSourceInput
  ): Promise<AcceptTaskBreakdownResult> {
    const validation = await this.validate(input);
    if (!validation.valid || validation.breakdown == null) {
      throw new BadRequestError("Breakdown is invalid");
    }

    const createdSubtasks: Task[] = [];
    for (const item of validation.breakdown.items) {
      createdSubtasks.push(
        await this.tasks.create({
          description: item.description,
          parentTaskId: validation.breakdown.taskId,
          title: item.title
        })
      );
    }

    return {
      accepted: true,
      createdSubtasks,
      taskId: validation.breakdown.taskId
    };
  }

  public async renderPreview(uri: string): Promise<string> {
    const validation = await this.validate({ uri });
    if (validation.breakdown == null) {
      return renderInvalidPreview(validation);
    }

    const parentTask = await this.requireTask(validation.breakdown.taskId);
    return renderValidPreview(parentTask, validation, uri, this.buildAcceptUrl());
  }

  private async loadBreakdown(input: TaskBreakdownSourceInput): Promise<{
    readonly breakdown: TaskBreakdown | null;
    readonly errors: readonly TaskBreakdownValidationError[];
    readonly uri: string | null;
  }> {
    if ("breakdown" in input) {
      return parseBreakdown(input.breakdown, null);
    }

    const filePath = getLocalFilePath(input.uri);
    const raw = await readFile(filePath, "utf8").catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new NotFoundError(`Breakdown file not found: ${input.uri}`);
      }

      throw error;
    });

    try {
      return parseBreakdown(JSON.parse(raw) as unknown, input.uri);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        return {
          breakdown: null,
          errors: [{ message: error.message, path: "" }],
          uri: input.uri
        };
      }

      throw error;
    }
  }

  private async validateBreakdown(
    breakdown: TaskBreakdown
  ): Promise<{
    readonly errors: readonly TaskBreakdownValidationError[];
    readonly warnings: readonly TaskBreakdownWarning[];
  }> {
    const errors = validateItems(breakdown);
    const warnings = validateDependencyOrder(breakdown);
    const task = await this.tasks.findById(breakdown.taskId);
    if (task == null) {
      errors.push({
        message: `Task ${breakdown.taskId} not found.`,
        path: "taskId"
      });
      return { errors, warnings };
    }

    const existingSubtasks = await this.tasks.findChildren(breakdown.taskId);
    if (existingSubtasks.length > 0) {
      warnings.push({
        code: "task_has_existing_subtasks",
        existingSubtasks,
        message:
          "This task already has subtasks. Work around the existing subtasks instead of replacing them."
      });
    }

    return { errors, warnings };
  }

  private async requireTask(taskId: TaskId): Promise<Task> {
    const task = await this.tasks.findById(taskId);
    if (task == null) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    return task;
  }

  private buildPreviewUrl(uri: string): string {
    const url = new URL(`${trimTrailingSlash(this.publicApiBaseUrl)}/breakdowns/preview`);
    url.searchParams.set("uri", uri);
    return url.toString();
  }

  private buildAcceptUrl(): string {
    return `${trimTrailingSlash(this.publicApiBaseUrl)}/breakdowns/accept`;
  }
}

function parseBreakdown(
  raw: unknown,
  uri: string | null
): {
  readonly breakdown: TaskBreakdown | null;
  readonly errors: readonly TaskBreakdownValidationError[];
  readonly uri: string | null;
} {
  const parsed = breakdownSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      breakdown: null,
      errors: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join(".")
      })),
      uri
    };
  }

  return {
    breakdown: parsed.data,
    errors: [],
    uri
  };
}

function validateItems(breakdown: TaskBreakdown): TaskBreakdownValidationError[] {
  const errors: TaskBreakdownValidationError[] = [];
  const seenIds = new Set<string>();
  const ids = new Set(breakdown.items.map((item) => item.id));

  breakdown.items.forEach((item, index) => {
    if (seenIds.has(item.id)) {
      errors.push({
        message: `Duplicate item id ${item.id}.`,
        path: `items.${String(index)}.id`
      });
    }
    seenIds.add(item.id);

    item.dependsOn.forEach((dependencyId, dependencyIndex) => {
      if (!ids.has(dependencyId)) {
        errors.push({
          message: `Dependency ${dependencyId} does not match another item id.`,
          path: `items.${String(index)}.dependsOn.${String(dependencyIndex)}`
        });
      }
    });
  });

  return errors;
}

function validateDependencyOrder(breakdown: TaskBreakdown): TaskBreakdownWarning[] {
  const warnings: TaskBreakdownWarning[] = [];
  const itemIndexes = new Map(
    breakdown.items.map((item, index) => [item.id, index] as const)
  );

  breakdown.items.forEach((item, index) => {
    item.dependsOn.forEach((dependencyId, dependencyIndex) => {
      const dependencyIndexInItems = itemIndexes.get(dependencyId);
      if (dependencyIndexInItems != null && dependencyIndexInItems > index) {
        warnings.push({
          code: "dependency_order",
          message:
            "This dependency appears after the item that depends on it. Consider reordering the breakdown.",
          path: `items.${String(index)}.dependsOn.${String(dependencyIndex)}`
        });
      }
    });
  });

  return warnings;
}

function getLocalFilePath(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }

  if (isAbsolute(uri)) {
    return uri;
  }

  throw new BadRequestError("Breakdown URI must be an absolute local file path");
}

function renderInvalidPreview(validation: TaskBreakdownValidationResult): string {
  return renderPage("Invalid breakdown", [
    "<h1>Invalid breakdown</h1>",
    "<ul>",
    ...validation.errors.map(
      (error) => `<li><code>${escapeHtml(error.path)}</code>: ${escapeHtml(error.message)}</li>`
    ),
    "</ul>"
  ]);
}

function renderValidPreview(
  parentTask: Task,
  validation: TaskBreakdownValidationResult,
  uri: string,
  acceptUrl: string
): string {
  const breakdown = validation.breakdown;
  if (breakdown == null) {
    return renderInvalidPreview(validation);
  }

  return renderPage(`Breakdown preview: ${parentTask.title}`, [
    `<h1>${escapeHtml(parentTask.title)}</h1>`,
    parentTask.description == null ? "" : `<p>${escapeHtml(parentTask.description)}</p>`,
    `<h2>Proposed breakdown</h2>`,
    `<p>${escapeHtml(breakdown.summary)}</p>`,
    renderWarnings(validation.warnings),
    "<ol>",
    ...breakdown.items.map((item) => renderBreakdownItem(item)),
    "</ol>",
    `<button type="button" id="accept-breakdown">Accept this breakdown</button>`,
    `<pre id="accept-result"></pre>`,
    `<script>
      document.getElementById("accept-breakdown").addEventListener("click", async () => {
        const response = await fetch(${JSON.stringify(acceptUrl)}, {
          body: JSON.stringify({ uri: ${JSON.stringify(uri)} }),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        });
        document.getElementById("accept-result").textContent =
          JSON.stringify(await response.json(), null, 2);
      });
    </script>`
  ]);
}

function renderBreakdownItem(item: TaskBreakdown["items"][number]): string {
  const dependencies =
    item.dependsOn.length === 0
      ? ""
      : `<p><strong>Depends on:</strong> ${escapeHtml(item.dependsOn.join(", "))}</p>`;

  return `<li>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.description)}</p>
    <p><strong>ID:</strong> <code>${escapeHtml(item.id)}</code></p>
    ${dependencies}
  </li>`;
}

function renderWarnings(warnings: readonly TaskBreakdownWarning[]): string {
  if (warnings.length === 0) {
    return "";
  }

  return [
    "<h2>Warnings</h2>",
    "<ul>",
    ...warnings.map((warning) => `<li>${escapeHtml(warning.message)}</li>`),
    "</ul>"
  ].join("\n");
}

function renderPage(title: string, body: readonly string[]): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      body { color: #111827; font: 16px/1.5 system-ui, sans-serif; margin: 40px auto; max-width: 880px; padding: 0 24px; }
      button { background: #111827; border: 0; color: white; cursor: pointer; font: inherit; padding: 10px 14px; }
      code { background: #f3f4f6; padding: 2px 4px; }
      li { margin: 0 0 16px; }
    </style>
  </head>
  <body>
    ${body.filter(Boolean).join("\n")}
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '"': "&quot;",
      "&": "&amp;",
      "'": "&#39;",
      "<": "&lt;",
      ">": "&gt;"
    };
    return entities[character] ?? character;
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
