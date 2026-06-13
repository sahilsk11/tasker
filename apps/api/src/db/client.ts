import SqliteDatabase from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { Database } from "./schema.js";

export type CreateDbOptions = {
  readonly path: string;
};

export function createDb(options: CreateDbOptions): Kysely<Database> {
  const database = new SqliteDatabase(options.path);
  database.pragma("foreign_keys = ON");

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database })
  });
}
