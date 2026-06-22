import { constants } from "node:fs";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type {
  TaskActionDetails,
  TaskActionRecord,
  UpdateTaskActionInput
} from "../domain/task-action.js";
import { parseTaskActionCatalog, type TaskActionCatalogEntry } from "../task-actions/catalog.js";

export type TaskActionRepository = {
  readonly findById: (id: string) => Promise<TaskActionRecord | null>;
  readonly findEditableById: (id: string) => Promise<TaskActionRecord | null>;
  readonly listAll: () => Promise<readonly TaskActionRecord[]>;
  readonly listEnabled: () => Promise<readonly TaskActionRecord[]>;
  readonly update: (
    id: string,
    input: UpdateTaskActionInput
  ) => Promise<TaskActionRecord | null>;
};

export class FileTaskActionRepository implements TaskActionRepository {
  public constructor(private readonly catalogPath: string) {}

  public async findById(id: string): Promise<TaskActionRecord | null> {
    const records = await this.listEnabled();
    return records.find((record) => record.id === id) ?? null;
  }

  public async findEditableById(id: string): Promise<TaskActionRecord | null> {
    const records = await this.listAll();
    return records.find((record) => record.id === id) ?? null;
  }

  public async listAll(): Promise<readonly TaskActionRecord[]> {
    return (await this.readCatalog()).records;
  }

  public async listEnabled(): Promise<readonly TaskActionRecord[]> {
    return (await this.readCatalog()).records.filter((record) => record.enabled);
  }

  public async update(
    id: string,
    input: UpdateTaskActionInput
  ): Promise<TaskActionRecord | null> {
    return await withCatalogLock(this.catalogPath, async () => {
      const { entries } = await this.readCatalog();
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) {
        return null;
      }

      const updatedEntries = entries.map((entry, entryIndex) =>
        entryIndex === index ? applyUpdate(entry, input) : entry
      );

      await writeCatalog(this.catalogPath, updatedEntries);
      return (await this.readCatalog()).records.find((record) => record.id === id) ?? null;
    });
  }

  private async readCatalog(): Promise<{
    readonly entries: readonly TaskActionCatalogEntry[];
    readonly records: readonly TaskActionRecord[];
  }> {
    const [content, fileStat] = await Promise.all([
      readFile(this.catalogPath, "utf8"),
      stat(this.catalogPath)
    ]);
    const entries = parseTaskActionCatalog(JSON.parse(content) as unknown);
    const timestamp = fileStat.mtime;
    return {
      entries,
      records: entries
        .map((entry) => toTaskActionRecord(entry, timestamp))
        .sort(compareTaskActionRecords)
    };
  }
}

function applyUpdate(
  action: TaskActionCatalogEntry,
  input: UpdateTaskActionInput
): TaskActionCatalogEntry {
  return {
    ...action,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.options !== undefined ? { options: input.options } : {}),
    ...(input.promptTemplate !== undefined
      ? { promptTemplate: input.promptTemplate }
      : {}),
    ...(input.recommendationStates !== undefined
      ? { recommendationStates: [...input.recommendationStates] }
      : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
  };
}

async function writeCatalog(
  catalogPath: string,
  entries: readonly TaskActionCatalogEntry[]
): Promise<void> {
  const parsed = parseTaskActionCatalog(entries);
  const tmpPath = `${catalogPath}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644
  });

  try {
    await rename(tmpPath, catalogPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

async function withCatalogLock<T>(
  catalogPath: string,
  callback: () => Promise<T>
): Promise<T> {
  const lockPath = `${catalogPath}.lock`;
  const startedAt = Date.now();
  let handle = await tryOpenLock(lockPath);

  while (handle == null) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error(`Timed out waiting for task action catalog lock at ${lockPath}`);
    }
    await sleep(25);
    handle = await tryOpenLock(lockPath);
  }

  try {
    return await callback();
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

async function tryOpenLock(lockPath: string) {
  await mkdir(dirname(lockPath), { recursive: true });
  try {
    return await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR);
  } catch (error) {
    if (isFileExistsError(error)) {
      return null;
    }
    throw error;
  }
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function toTaskActionRecord(
  entry: TaskActionCatalogEntry,
  timestamp: Date
): TaskActionRecord {
  return {
    createdAt: timestamp,
    description: entry.description,
    enabled: entry.enabled,
    iconName: entry.iconName ?? null,
    id: entry.id,
    isRecommended: false,
    label: entry.label,
    options: entry.options ?? null,
    promptTemplate: entry.promptTemplate,
    recommendationStates: entry.recommendationStates,
    sortOrder: entry.sortOrder,
    updatedAt: timestamp
  };
}

function compareTaskActionRecords(
  left: TaskActionRecord,
  right: TaskActionRecord
): number {
  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label);
}

function toTaskActionSummary(record: TaskActionRecord) {
  return {
    description: record.description,
    iconName: record.iconName,
    id: record.id,
    isRecommended: record.isRecommended,
    label: record.label,
    options: record.options
  };
}

export function toTaskAction(record: TaskActionRecord) {
  return toTaskActionSummary(record);
}

export function toTaskActionDetails(record: TaskActionRecord): TaskActionDetails {
  return {
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    enabled: record.enabled,
    iconName: record.iconName,
    id: record.id,
    isRecommended: record.isRecommended,
    label: record.label,
    options: record.options,
    promptTemplate: record.promptTemplate,
    recommendationStates: record.recommendationStates,
    sortOrder: record.sortOrder,
    updatedAt: record.updatedAt.toISOString()
  };
}
