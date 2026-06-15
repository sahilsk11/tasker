import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { FastifyInstance } from "fastify";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

export async function registerStaticFrontend(
  app: FastifyInstance,
  webDistDirectory: string
): Promise<void> {
  const root = resolve(webDistDirectory);
  const indexPath = join(root, "index.html");
  await access(indexPath);

  app.get("/*", async (request, reply) => {
    const requestPath = new URL(request.url, "http://tasker.localhost").pathname;
    const filePath = await resolveFrontendPath(root, requestPath);
    const extension = extname(filePath);

    return reply
      .type(contentTypes.get(extension) ?? "application/octet-stream")
      .send(createReadStream(filePath));
  });
}

async function resolveFrontendPath(root: string, requestPath: string): Promise<string> {
  const normalizedPath = normalize(decodeURIComponent(requestPath)).replace(
    /^(\.\.(\/|\\|$))+/u,
    ""
  );
  const candidate = resolve(join(root, normalizedPath));

  if (!isInside(root, candidate)) {
    return join(root, "index.html");
  }

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isFile()) {
      return candidate;
    }
  } catch {
    return join(root, "index.html");
  }

  return join(root, "index.html");
}

function isInside(root: string, candidate: string): boolean {
  const localPath = relative(root, candidate);
  return localPath.length === 0 || (!localPath.startsWith("..") && !isAbsolute(localPath));
}
