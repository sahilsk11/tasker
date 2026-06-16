import { loadEnv } from "../src/config/env.js";
import { migrate } from "../src/db/migrate.js";
import {
  applyTaskActionDefaultsAtPath,
  type ApplyTaskActionDefaultsMode
} from "../src/task-actions/apply-defaults.js";

const mode: ApplyTaskActionDefaultsMode = process.argv.includes("--update")
  ? "update"
  : "insert-missing";

const env = loadEnv();

migrate({ databasePath: env.databasePath });

const result = await applyTaskActionDefaultsAtPath(env.databasePath, { mode });

console.log(
  JSON.stringify(
    {
      databasePath: env.databasePath,
      mode,
      ...result
    },
    null,
    2
  )
);
