import { z } from "zod";
import { BadRequestError } from "./errors.js";

const linearGraphqlUrl = "https://api.linear.app/graphql";

const linearTeamsSchema = z.object({
  teams: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        name: z.string()
      })
    )
  })
});

const linearProjectsSchema = z.object({
  projects: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        teams: z.object({
          nodes: z.array(
            z.object({
              id: z.string()
            })
          )
        })
      })
    )
  })
});

const linearWorkflowStatesSchema = z.object({
  workflowStates: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        position: z.number(),
        team: z.object({
          id: z.string()
        }),
        type: z.string()
      })
    )
  })
});

const createIssueSchema = z.object({
  issueCreate: z.object({
    issue: z.object({
      id: z.string(),
      identifier: z.string(),
      url: z.string().url()
    }),
    success: z.boolean()
  })
});

const linearIssuesSchema = z.object({
  issues: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        state: z.object({
          id: z.string(),
          name: z.string(),
          position: z.number(),
          team: z.object({
            id: z.string(),
            key: z.string(),
            name: z.string()
          }),
          type: z.string()
        }),
        url: z.string().url()
      })
    )
  })
});

type GraphqlResponse<T> = {
  readonly data?: T;
  readonly errors?: ReadonlyArray<{ readonly message?: string }>;
};

export type LinearProjectOption = {
  readonly id: string;
  readonly name: string;
  readonly teamIds: readonly string[];
};

export type LinearStateOption = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly type: string;
};

export type LinearTeamOption = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly states: readonly LinearStateOption[];
};

export type LinearOptions = {
  readonly configured: boolean;
  readonly projects: readonly LinearProjectOption[];
  readonly teams: readonly LinearTeamOption[];
};

export type CreateLinearIssueInput = {
  readonly description: string | null;
  readonly projectId: string | null;
  readonly stateId: string;
  readonly teamId: string;
  readonly title: string;
};

export type LinearServiceOptions = {
  readonly fetchImpl?: typeof fetch;
};

export type LinearIssue = {
  readonly id: string;
  readonly identifier: string;
  readonly url: string;
};

export type LinearIssueStatus = {
  readonly id: string;
  readonly identifier: string;
  readonly state: LinearStateOption & {
    readonly team: {
      readonly id: string;
      readonly key: string;
      readonly name: string;
    };
  };
  readonly url: string;
};

export class LinearService {
  private readonly fetchImpl: typeof fetch;

  public constructor(
    private readonly apiKey: string | null,
    options: LinearServiceOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async getOptions(): Promise<LinearOptions> {
    if (this.apiKey == null) {
      return { configured: false, projects: [], teams: [] };
    }

    const [teamsData, statesData, projectsData] = await Promise.all([
      this.request(
        `query TaskerLinearTeams {
          teams(first: 100) {
            nodes {
              id
              key
              name
            }
          }
        }`
      ),
      this.request(
        `query TaskerLinearWorkflowStates {
          workflowStates(first: 250) {
            nodes {
              id
              name
              position
              type
              team {
                id
              }
            }
          }
        }`
      ),
      this.request(
        `query TaskerLinearProjects {
          projects(first: 100, includeArchived: false) {
            nodes {
              id
              name
              teams {
                nodes {
                  id
                }
              }
            }
          }
        }`
      )
    ]);
    const teams = linearTeamsSchema.parse(teamsData).teams.nodes;
    const states = linearWorkflowStatesSchema.parse(statesData).workflowStates.nodes;
    const projects = linearProjectsSchema.parse(projectsData).projects.nodes;
    const statesByTeamId = groupStatesByTeamId(states);

    return {
      configured: true,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        teamIds: project.teams.nodes.map((team) => team.id)
      })),
      teams: teams.map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
        states: statesByTeamId.get(team.id) ?? []
      }))
    };
  }

  public async createIssue(input: CreateLinearIssueInput): Promise<LinearIssue> {
    if (this.apiKey == null) {
      throw new BadRequestError("LINEAR_API_KEY is not configured.");
    }

    const data = await this.request(
      `mutation TaskerCreateLinearIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }`,
      {
        input: {
          ...(input.description == null ? {} : { description: input.description }),
          ...(input.projectId == null ? {} : { projectId: input.projectId }),
          stateId: input.stateId,
          teamId: input.teamId,
          title: input.title
        }
      }
    );
    const parsed = createIssueSchema.parse(data);

    if (!parsed.issueCreate.success) {
      throw new BadRequestError("Linear did not create the issue.");
    }

    return parsed.issueCreate.issue;
  }

  public async getIssueStatuses(
    identifiers: readonly string[]
  ): Promise<readonly LinearIssueStatus[]> {
    if (this.apiKey == null) {
      return [];
    }

    const issueRefs = Array.from(new Map(
      identifiers
        .map(parseIssueIdentifier)
        .filter((ref): ref is LinearIssueRef => ref != null)
        .map((ref) => [ref.identifier, ref])
    ).values())
      .slice(0, 100);
    if (issueRefs.length === 0) {
      return [];
    }

    const data = await this.request(
      `query TaskerLinearIssueStatuses($filter: IssueFilter) {
        issues(first: 100, filter: $filter) {
          nodes {
            id
            identifier
            url
            state {
              id
              name
              position
              type
              team {
                id
                key
                name
              }
            }
          }
        }
      }`,
      { filter: getIssueFilter(issueRefs) }
    );
    const issues = linearIssuesSchema.parse(data).issues.nodes;

    return issues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      state: {
        id: issue.state.id,
        name: issue.state.name,
        position: issue.state.position,
        team: issue.state.team,
        type: issue.state.type
      },
      url: issue.url
    }));
  }

  private async request(query: string, variables?: object): Promise<unknown> {
    if (this.apiKey == null) {
      throw new BadRequestError("LINEAR_API_KEY is not configured.");
    }

    const response = await this.fetchImpl(linearGraphqlUrl, {
      body: JSON.stringify({ query, variables }),
      headers: {
        "Authorization": this.apiKey,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const body = (await response.json()) as GraphqlResponse<unknown>;
    if (!response.ok || body.errors != null) {
      throw new BadRequestError(getLinearErrorMessage(response, body.errors));
    }

    return body.data;
  }
}

type LinearIssueRef = {
  readonly identifier: string;
  readonly number: number;
  readonly teamKey: string;
};

function parseIssueIdentifier(identifier: string): LinearIssueRef | null {
  const match = /^(?<teamKey>[A-Z][A-Z0-9]*)-(?<number>[0-9]+)$/u.exec(
    identifier.trim().toUpperCase()
  );
  const teamKey = match?.groups?.["teamKey"];
  const number = Number.parseInt(match?.groups?.["number"] ?? "", 10);
  if (teamKey == null || !Number.isInteger(number)) {
    return null;
  }

  return {
    identifier: `${teamKey}-${String(number)}`,
    number,
    teamKey
  };
}

function getIssueFilter(issueRefs: readonly LinearIssueRef[]): object {
  const numbersByTeamKey = new Map<string, number[]>();
  for (const ref of issueRefs) {
    const numbers = numbersByTeamKey.get(ref.teamKey) ?? [];
    numbers.push(ref.number);
    numbersByTeamKey.set(ref.teamKey, numbers);
  }

  const filters = Array.from(numbersByTeamKey, ([teamKey, numbers]) => ({
    and: [
      { team: { key: { eq: teamKey } } },
      { number: { in: numbers } }
    ]
  }));

  return filters.length === 1 ? filters[0] ?? {} : { or: filters };
}

function groupStatesByTeamId(
  states: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly team: { readonly id: string };
    readonly type: string;
  }>
): Map<string, readonly LinearStateOption[]> {
  const statesByTeamId = new Map<string, LinearStateOption[]>();

  for (const state of states) {
    const existingStates = statesByTeamId.get(state.team.id) ?? [];
    existingStates.push({
      id: state.id,
      name: state.name,
      position: state.position,
      type: state.type
    });
    existingStates.sort((left, right) => left.position - right.position);
    statesByTeamId.set(state.team.id, existingStates);
  }

  return statesByTeamId;
}

function getLinearErrorMessage(
  response: Response,
  errors: ReadonlyArray<{ readonly message?: string }> | undefined
): string {
  const firstError = errors?.find((error) => typeof error.message === "string");
  if (firstError?.message != null) {
    return firstError.message;
  }

  return `Linear request failed with ${String(response.status)} ${response.statusText}`;
}
