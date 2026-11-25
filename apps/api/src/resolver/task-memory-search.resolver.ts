import type { FastifyInstance } from "fastify";
import { parseTaskMemorySearchQuery } from "../command/task-memory-search.command.js";
import type { TaskMemorySearchService } from "../service/task-memory-search.js";

export function registerTaskMemorySearchResolver(
  server: FastifyInstance,
  searchService: TaskMemorySearchService
): void {
  server.get("/search/status", async () => searchService.getIndexStatus());
  server.get("/search", async (request) =>
    searchService.search(parseTaskMemorySearchQuery(request.query))
  );
}
