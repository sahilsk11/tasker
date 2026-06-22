export type RuntimeInfo = {
  readonly databasePath: string;
  readonly nodeVersion: string;
  readonly ok: true;
  readonly pid: number;
  readonly publicApiBaseUrl: string;
  readonly service: "tasker-api";
  readonly taskActionsPath: string;
  readonly uptimeSeconds: number;
};
