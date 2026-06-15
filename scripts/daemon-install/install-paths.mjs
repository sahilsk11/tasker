import { homedir } from "node:os";
import { join } from "node:path";

export function getInstallPaths(platform, installRootOverride = null) {
  if (platform === "darwin") {
    const root =
      installRootOverride ?? join(homedir(), "Library", "Application Support", "Tasker");
    return {
      appDir: join(root, "app"),
      configPath: join(root, "config.json"),
      databasePath: join(root, "tasker.sqlite"),
      logsDir: join(root, "logs"),
      platform,
      root,
      servicePath: join(homedir(), "Library", "LaunchAgents", "com.tasker.app.plist")
    };
  }

  if (platform === "linux") {
    const root = installRootOverride ?? join(homedir(), ".local", "share", "tasker");
    return {
      appDir: join(root, "app"),
      configPath: join(root, "config.json"),
      databasePath: join(root, "tasker.sqlite"),
      logsDir: join(root, "logs"),
      platform,
      root,
      servicePath: join(homedir(), ".config", "systemd", "user", "tasker.service")
    };
  }

  throw new Error(`Unsupported platform for daemon install: ${platform}`);
}
