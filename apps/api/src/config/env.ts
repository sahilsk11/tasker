export type Env = {
  readonly databasePath: string;
  readonly host: string;
  readonly port: number;
};

export function loadEnv(): Env {
  return {
    databasePath: process.env["DATABASE_PATH"] ?? "./tasker.sqlite",
    host: process.env["HOST"] ?? "127.0.0.1",
    port: Number.parseInt(process.env["PORT"] ?? "3000", 10)
  };
}
