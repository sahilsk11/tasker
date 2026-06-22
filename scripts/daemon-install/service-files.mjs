import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeUserService(paths, choices) {
  await mkdir(dirname(paths.servicePath), { recursive: true });
  const content =
    paths.platform === "darwin"
      ? createLaunchAgent(paths, choices)
      : createSystemdUserService(paths, choices);
  await writeFile(paths.servicePath, content);
}

export function createProxyService(paths, choices) {
  return paths.platform === "darwin"
    ? {
        destination: "/Library/LaunchDaemons/com.tasker.proxy.plist",
        reload: [
          ["sudo", "launchctl", "bootout", "system", "/Library/LaunchDaemons/com.tasker.proxy.plist"],
          ["sudo", "launchctl", "bootstrap", "system", "/Library/LaunchDaemons/com.tasker.proxy.plist"],
          ["sudo", "launchctl", "kickstart", "-k", "system/com.tasker.proxy"]
        ],
        source: join(paths.root, "com.tasker.proxy.plist"),
        text: createLaunchDaemonProxy(paths, choices)
      }
    : {
        destination: "/etc/systemd/system/tasker-proxy.service",
        reload: [
          ["sudo", "systemctl", "daemon-reload"],
          ["sudo", "systemctl", "enable", "--now", "tasker-proxy.service"],
          ["sudo", "systemctl", "restart", "tasker-proxy.service"]
        ],
        source: join(paths.root, "tasker-proxy.service"),
        text: createSystemdProxy(paths, choices)
      };
}

function createLaunchAgent(paths, choices) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tasker.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(join(paths.appDir, "dist", "index.js"))}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    ${plistEnv(paths, choices)}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(paths.logsDir, "tasker.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(paths.logsDir, "tasker.err.log"))}</string>
</dict>
</plist>
`;
}

function createLaunchDaemonProxy(paths, choices) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tasker.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(join(paths.appDir, "dist", "port-proxy.js"))}</string>
    <string>--listen-port</string>
    <string>80</string>
    <string>--target-port</string>
    <string>${String(choices.port)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`;
}

function createSystemdUserService(paths, choices) {
  return `[Unit]
Description=Tasker local app
After=network.target

[Service]
Type=simple
ExecStart=${systemdQuote(process.execPath)} ${systemdQuote(join(paths.appDir, "dist", "index.js"))}
Restart=always
RestartSec=2
Environment=${systemdQuote("HOST=127.0.0.1")}
Environment=${systemdQuote(`PORT=${String(choices.port)}`)}
Environment=${systemdQuote(`DATABASE_PATH=${paths.databasePath}`)}
Environment=${systemdQuote(`PUBLIC_API_BASE_URL=${getAccessUrl(choices)}/api`)}
Environment=${systemdQuote(`TASKER_PUBLIC_APP_BASE_URL=${getAccessUrl(choices)}`)}
Environment=${systemdQuote(`TASKER_WEB_DIST_DIR=${join(paths.appDir, "web")}`)}
Environment=${systemdQuote(`TASKER_MIGRATIONS_DIR=${join(paths.appDir, "migrations")}`)}
StandardOutput=append:${systemdEscapePath(join(paths.logsDir, "tasker.log"))}
StandardError=append:${systemdEscapePath(join(paths.logsDir, "tasker.err.log"))}

[Install]
WantedBy=default.target
`;
}

function createSystemdProxy(paths, choices) {
  return `[Unit]
Description=Tasker local port 80 proxy
After=network.target

[Service]
Type=simple
ExecStart=${systemdQuote(process.execPath)} ${systemdQuote(join(paths.appDir, "dist", "port-proxy.js"))} --listen-port 80 --target-port ${String(choices.port)}
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
}

function plistEnv(paths, choices) {
  const values = {
    DATABASE_PATH: paths.databasePath,
    HOST: "127.0.0.1",
    PORT: String(choices.port),
    PUBLIC_API_BASE_URL: `${getAccessUrl(choices)}/api`,
    TASKER_MIGRATIONS_DIR: join(paths.appDir, "migrations"),
    TASKER_PUBLIC_APP_BASE_URL: getAccessUrl(choices),
    TASKER_WEB_DIST_DIR: join(paths.appDir, "web")
  };

  return Object.entries(values)
    .map(
      ([key, value]) =>
        `<key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`
    )
    .join("\n    ");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function systemdQuote(value) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("$", "$$")}"`;
}

function systemdEscapePath(value) {
  return Array.from(value, (character) => {
    if (/^[A-Za-z0-9_./-]$/u.test(character)) {
      return character;
    }

    return Array.from(Buffer.from(character), (byte) =>
      `\\x${byte.toString(16).padStart(2, "0")}`
    ).join("");
  }).join("");
}

function getAccessUrl(choices) {
  return choices.access === "pretty"
    ? "http://tasker.localhost"
    : `http://tasker.localhost:${String(choices.port)}`;
}
