export function parseArgs(argv) {
  const options = {
    access: null,
    dryRun: false,
    installRoot: null,
    open: true,
    port: null,
    skipService: false,
    yes: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-open") {
      options.open = false;
    } else if (arg === "--access") {
      options.access = readValue(argv, (index += 1), arg);
    } else if (arg === "--port") {
      options.port = Number.parseInt(readValue(argv, (index += 1), arg), 10);
    } else if (arg === "--install-root") {
      options.installRoot = readValue(argv, (index += 1), arg);
    } else if (arg === "--skip-service") {
      options.skipService = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function printHelp() {
  console.info(`Usage: pnpm install-daemon [options]

Options:
  -y, --yes              Install with defaults without prompts
  --access standard      Use tasker.localhost:<port>
  --access pretty        Use tasker.localhost through a privileged port-80 proxy
  --port <port>          Internal Tasker port, default 48273
  --install-root <path>  Override the Tasker home directory
  --dry-run              Print actions without writing service files or starting services
  --skip-service         Install the runtime but do not write or start services
  --no-open              Do not open the browser after install
  -h, --help             Show this help
`);
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (value == null || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}
