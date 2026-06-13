import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import SqliteDatabase from "better-sqlite3";

export type MigrateOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
};

export function migrate(options: MigrateOptions): void {
  const database = new SqliteDatabase(options.databasePath);
  database.pragma("foreign_keys = ON");

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);

    const migrationsDirectory =
      options.migrationsDirectory ?? findDefaultMigrationsDirectory();

    const applied = new Set(
      database
        .prepare("SELECT version FROM schema_migrations")
        .all()
        .map((row) => (row as { version: string }).version)
    );

    const migrations = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".up.sql"))
      .sort();

    const applyMigration = database.transaction((file: string) => {
      database.exec(readFileSync(join(migrationsDirectory, file), "utf8"));
      database
        .prepare("INSERT INTO schema_migrations (version) VALUES (?)")
        .run(basename(file, ".up.sql"));
    });

    for (const file of migrations) {
      const version = basename(file, ".up.sql");
      if (!applied.has(version)) {
        applyMigration(file);
      }
    }
  } finally {
    database.close();
  }
}

function findDefaultMigrationsDirectory(): string {
  const candidates = [
    new URL("../migrations", import.meta.url).pathname,
    new URL("../../migrations", import.meta.url).pathname
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found == null) {
    throw new Error("Unable to locate migrations directory");
  }

  return found;
}
