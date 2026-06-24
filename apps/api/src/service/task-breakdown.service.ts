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

    const parentTask = await this.tasks.findById(validation.breakdown.taskId);
    if (parentTask == null) {
      throw new NotFoundError(`Task ${validation.breakdown.taskId} not found.`);
    }

    const createdSubtasks = await this.tasks.createSubtasks({
      parentTaskId: validation.breakdown.taskId,
      subtasks: validation.breakdown.items.map((item) => ({
        dependsOn: item.dependsOn,
        description: item.description,
        id: item.id,
        title: item.title
      })),
      workingDirectory: parentTask.workingDirectory
    });

    return {
      accepted: true,
      createdSubtasks,
      taskId: validation.breakdown.taskId
    };
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

  private buildPreviewUrl(uri: string): string {
    const url = new URL(`${getFrontendBaseUrl(this.publicApiBaseUrl)}/breakdowns/preview`);
    url.searchParams.set("uri", uri);
    return url.toString();
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function getFrontendBaseUrl(publicApiBaseUrl: string): string {
  return trimTrailingSlash(publicApiBaseUrl).replace(/\/api$/u, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
