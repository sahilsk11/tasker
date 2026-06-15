import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GitHubService } from "../service/github.service.js";

const pullRequestStatusesSchema = z.object({
  urls: z.array(z.string().min(1)).max(50)
});

export function registerGitHubResolver(
  server: FastifyInstance,
  githubService: GitHubService
): void {
  server.post("/github/pull-requests/statuses", async (request) => {
    const { urls } = pullRequestStatusesSchema.parse(request.body);
    return {
      pullRequests: await githubService.getPullRequestStatuses(urls)
    };
  });
}
