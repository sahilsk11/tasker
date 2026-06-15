import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function getInstallChoices(options) {
  if (options.help) {
    return null;
  }

  if (options.yes) {
    return {
      access: normalizeAccess(options.access ?? "standard"),
      configure: true,
      port: normalizePort(options.port ?? 48273)
    };
  }

  const readline = createInterface({ input, output });
  try {
    const configure = await confirm(
      readline,
      "Configure Tasker as a background service? [Y/n] ",
      true
    );
    if (!configure) {
      return { configure: false };
    }

    const access = normalizeAccess(
      await ask(
        readline,
        "Access mode: standard tasker.localhost:<port> or pretty tasker.localhost? [standard] ",
        options.access ?? "standard"
      )
    );
    if (access === "pretty") {
      console.info(
        "Pretty URL mode installs a root-owned port-80 proxy. You may be prompted for your password."
      );
    }

    const port = normalizePort(
      options.port ??
        Number.parseInt(await ask(readline, "Internal port [48273] ", "48273"), 10)
    );

    return { access, configure: true, port };
  } finally {
    readline.close();
  }
}

async function ask(readline, question, defaultValue) {
  const answer = (await readline.question(question)).trim();
  return answer.length > 0 ? answer : defaultValue;
}

async function confirm(readline, question, defaultValue) {
  const answer = (await readline.question(question)).trim().toLowerCase();
  if (answer.length === 0) {
    return defaultValue;
  }

  return ["y", "yes"].includes(answer);
}

function normalizeAccess(value) {
  if (value !== "standard" && value !== "pretty") {
    throw new Error(`Invalid access mode: ${value}`);
  }

  return value;
}

function normalizePort(value) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`Port must be an integer from 1024 through 65535: ${String(value)}`);
  }

  return value;
}
