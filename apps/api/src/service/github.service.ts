import { BadRequestError } from "./errors.js";
import { discoverGitHubToken } from "./github-token.js";

export type PullRequestStatus = "closed" | "draft" | "merged" | "open" | "unknown";

export type PullRequestStatusResult = {
  readonly error: string | null;
  readonly number: number | null;
  readonly status: PullRequestStatus;
  readonly url: string;
};

export type GitHubServiceOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly homeDir?: string | undefined;
};

type GitHubPullResponse = {
  readonly draft?: boolean;
  readonly merged_at?: string | null;
  readonly number?: number;
  readonly state?: string;
};

type ParsedPullRequestUrl = {
  readonly apiUrl: string;
  readonly number: number;
};

export class GitHubService {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: GitHubServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async getPullRequestStatuses(
    urls: readonly string[]
  ): Promise<readonly PullRequestStatusResult[]> {
    const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
    if (uniqueUrls.length > 50) {
      throw new BadRequestError("At most 50 pull request URLs can be checked at once");
    }

    const tokenSource = await discoverGitHubToken({
      env: this.options.env,
      homeDir: this.options.homeDir
    });
    return Promise.all(
      uniqueUrls.map((url) => this.getPullRequestStatus(url, tokenSource?.token ?? null))
    );
  }

  private async getPullRequestStatus(
    url: string,
    token: string | null
  ): Promise<PullRequestStatusResult> {
    const parsed = parseGitHubPullRequestUrl(url);
    if (parsed == null) {
      return {
        error: "Only github.com pull request URLs are supported",
        number: null,
        status: "unknown",
        url
      };
    }

    const response = await this.fetchImpl(parsed.apiUrl, {
      headers: {
        "Accept": "application/vnd.github+json",
        ...(token == null ? {} : { "Authorization": `Bearer ${token}` }),
        "User-Agent": "tasker"
      }
    });
    const resolvedResponse =
      token != null && response.status === 401
        ? await this.fetchImpl(parsed.apiUrl, {
            headers: {
              "Accept": "application/vnd.github+json",
              "User-Agent": "tasker"
            }
          })
        : response;

    if (!resolvedResponse.ok) {
      return {
        error: `GitHub returned ${String(resolvedResponse.status)}`,
        number: parsed.number,
        status: "unknown",
        url
      };
    }

    const pullRequest = (await resolvedResponse.json()) as GitHubPullResponse;
    return {
      error: null,
      number: pullRequest.number ?? parsed.number,
      status: getPullRequestStatus(pullRequest),
      url
    };
  }
}

function parseGitHubPullRequestUrl(value: string): ParsedPullRequestUrl | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    return null;
  }

  const [owner, repo, pull, numberValue] = url.pathname.split("/").filter(Boolean);
  const number = Number.parseInt(numberValue ?? "", 10);
  if (owner == null || repo == null || pull !== "pull" || !Number.isInteger(number)) {
    return null;
  }

  return {
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/pulls/${String(number)}`,
    number
  };
}

function getPullRequestStatus(pullRequest: GitHubPullResponse): PullRequestStatus {
  if (pullRequest.draft === true) {
    return "draft";
  }

  if (pullRequest.merged_at != null) {
    return "merged";
  }

  if (pullRequest.state === "open") {
    return "open";
  }

  if (pullRequest.state === "closed") {
    return "closed";
  }

  return "unknown";
}
