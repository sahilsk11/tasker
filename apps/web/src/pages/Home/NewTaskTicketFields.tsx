import { ChevronDown } from "lucide-react";
import type {
  LinearOptions,
  LinearProjectOption,
  LinearStateOption
} from "@/api/tasks";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function TicketFields({
  errorMessage,
  isLoading,
  linearOptions,
  onProjectChange,
  onStateChange,
  onTeamChange,
  projectId,
  projectOptions,
  stateId,
  stateOptions,
  teamId
}: {
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly linearOptions: LinearOptions | null;
  readonly onProjectChange: (projectId: string) => void;
  readonly onStateChange: (stateId: string) => void;
  readonly onTeamChange: (teamId: string) => void;
  readonly projectId: string;
  readonly projectOptions: readonly LinearProjectOption[];
  readonly stateId: string;
  readonly stateOptions: readonly LinearStateOption[];
  readonly teamId: string;
}): React.JSX.Element {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-secondary/35 p-3">
      <LinearIssueFields
        errorMessage={errorMessage}
        isLoading={isLoading}
        linearOptions={linearOptions}
        projectId={projectId}
        projectOptions={projectOptions}
        stateId={stateId}
        stateOptions={stateOptions}
        teamId={teamId}
        onProjectChange={onProjectChange}
        onStateChange={onStateChange}
        onTeamChange={onTeamChange}
      />
    </div>
  );
}

function LinearIssueFields({
  errorMessage,
  isLoading,
  linearOptions,
  onProjectChange,
  onStateChange,
  onTeamChange,
  projectId,
  projectOptions,
  stateId,
  stateOptions,
  teamId
}: {
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly linearOptions: LinearOptions | null;
  readonly onProjectChange: (projectId: string) => void;
  readonly onStateChange: (stateId: string) => void;
  readonly onTeamChange: (teamId: string) => void;
  readonly projectId: string;
  readonly projectOptions: readonly LinearProjectOption[];
  readonly stateId: string;
  readonly stateOptions: readonly LinearStateOption[];
  readonly teamId: string;
}): React.JSX.Element {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Linear options...</p>;
  }

  if (errorMessage != null) {
    return <p className="text-sm text-destructive">{errorMessage}</p>;
  }

  if (linearOptions?.configured === false) {
    return (
      <p className="text-sm text-muted-foreground">
        Set LINEAR_API_KEY on the API server to load Linear teams and statuses.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="linear-team">Linear team</Label>
        <NativeSelect
          id="linear-team"
          value={teamId}
          onChange={(event) => onTeamChange(event.target.value)}
        >
          <option value="">Choose a team</option>
          {(linearOptions?.teams ?? []).map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.key})
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="linear-state">Status</Label>
        <NativeSelect
          id="linear-state"
          value={stateId}
          onChange={(event) => onStateChange(event.target.value)}
          disabled={teamId.length === 0}
        >
          <option value="">Choose a status</option>
          {stateOptions.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="linear-project">Project / board</Label>
        <NativeSelect
          id="linear-project"
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
          disabled={teamId.length === 0}
        >
          <option value="">No project</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {teamId.length > 0 && stateId.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          The Linear issue will be created from this task name and description, then
          saved back as this task's ticket.
        </p>
      ) : null}
    </div>
  );
}

function NativeSelect({
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-secondary/50 px-3 pr-10 text-sm text-foreground",
          "transition-colors focus:border-border focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
