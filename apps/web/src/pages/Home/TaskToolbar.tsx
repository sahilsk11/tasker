import { useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal
} from "lucide-react";
import type { LinearOptions, LinearTeamOption } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { TaskFilter, TaskSort } from "./task-filtering";

const filters: ReadonlyArray<{ readonly label: string; readonly value: TaskFilter }> = [
  { label: "All tasks", value: "all" },
  { label: "Root tasks", value: "root" },
  { label: "Subtasks", value: "subtask" },
  { label: "Has PR", value: "has-pr" },
  { label: "Has ticket", value: "has-ticket" }
];

const sorts: ReadonlyArray<{ readonly label: string; readonly value: TaskSort }> = [
  { label: "Recently updated", value: "updated-desc" },
  { label: "Newest", value: "created-desc" },
  { label: "Oldest", value: "created-asc" },
  { label: "Title", value: "title-asc" }
];

export function TaskToolbar({
  filter,
  isFilterOpen,
  isLinearLoading,
  linearOptions,
  linearStateIds,
  linearTeamId,
  linearTeams,
  onFilterChange,
  onFilterOpenChange,
  onLinearStateIdsChange,
  onLinearTeamChange,
  onQueryChange,
  onSortChange,
  query,
  sort
}: {
  readonly filter: TaskFilter;
  readonly isFilterOpen: boolean;
  readonly isLinearLoading: boolean;
  readonly linearOptions: LinearOptions | null;
  readonly linearStateIds: readonly string[];
  readonly linearTeamId: string;
  readonly linearTeams: readonly LinearTeamOption[];
  readonly onFilterChange: (filter: TaskFilter) => void;
  readonly onFilterOpenChange: (isOpen: boolean) => void;
  readonly onLinearStateIdsChange: (stateIds: readonly string[]) => void;
  readonly onLinearTeamChange: (teamId: string) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onSortChange: (sort: TaskSort) => void;
  readonly query: string;
  readonly sort: TaskSort;
}): React.JSX.Element {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const selectedLinearTeam =
    linearTeams.find((team) => team.id === linearTeamId) ?? linearTeams[0] ?? null;
  const hasPartialLinearStatusFilter =
    selectedLinearTeam != null &&
    linearStateIds.length > 0 &&
    linearStateIds.length !== selectedLinearTeam.states.length;
  const activeFilterCount =
    (filter === "all" ? 0 : 1) + (hasPartialLinearStatusFilter ? 1 : 0);
  const selectedSortLabel =
    sorts.find((option) => option.value === sort)?.label ?? "Recently updated";

  return (
    <section className="mx-auto flex w-full max-w-[76rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search tasks"
          className="h-10 pl-9"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search tasks..."
          value={query}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SortMenu
          isOpen={isSortOpen}
          selectedLabel={selectedSortLabel}
          sort={sort}
          onOpenChange={setIsSortOpen}
          onSortChange={(nextSort) => {
            onSortChange(nextSort);
            setIsSortOpen(false);
          }}
        />

        <Popover open={isFilterOpen} onOpenChange={onFilterOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <SlidersHorizontal className="size-4" />
              Filters
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0.5">
                  {activeFilterCount}
                </Badge>
              ) : null}
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <FilterContent
              filter={filter}
              isLinearLoading={isLinearLoading}
              linearOptions={linearOptions}
              linearStateIds={linearStateIds}
              linearTeam={selectedLinearTeam}
              linearTeams={linearTeams}
              onFilterChange={onFilterChange}
              onLinearStateIdsChange={onLinearStateIdsChange}
              onLinearTeamChange={onLinearTeamChange}
            />
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

function SortMenu({
  isOpen,
  onOpenChange,
  onSortChange,
  selectedLabel,
  sort
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSortChange: (sort: TaskSort) => void;
  readonly selectedLabel: string;
  readonly sort: TaskSort;
}): React.JSX.Element {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="max-w-36 shrink-0 justify-between gap-2 sm:max-w-44"
        >
          <ArrowUpDown className="size-4" />
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <SegmentedOptions options={sorts} value={sort} onChange={onSortChange} />
      </PopoverContent>
    </Popover>
  );
}

function FilterContent({
  filter,
  isLinearLoading,
  linearOptions,
  linearStateIds,
  linearTeam,
  linearTeams,
  onFilterChange,
  onLinearStateIdsChange,
  onLinearTeamChange
}: {
  readonly filter: TaskFilter;
  readonly isLinearLoading: boolean;
  readonly linearOptions: LinearOptions | null;
  readonly linearStateIds: readonly string[];
  readonly linearTeam: LinearTeamOption | null;
  readonly linearTeams: readonly LinearTeamOption[];
  readonly onFilterChange: (filter: TaskFilter) => void;
  readonly onLinearStateIdsChange: (stateIds: readonly string[]) => void;
  readonly onLinearTeamChange: (teamId: string) => void;
}): React.JSX.Element {
  return (
    <div className="grid gap-4 p-3">
      <FilterSection title="Tasks">
        <SegmentedOptions
          options={filters}
          value={filter}
          onChange={onFilterChange}
        />
      </FilterSection>
      <Separator />
      <LinearStatusFilter
        isLoading={isLinearLoading}
        linearOptions={linearOptions}
        selectedStateIds={linearStateIds}
        selectedTeam={linearTeam}
        teams={linearTeams}
        onSelectedStateIdsChange={onLinearStateIdsChange}
        onTeamChange={onLinearTeamChange}
      />
    </div>
  );
}

function FilterSection({
  children,
  title
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-medium uppercase text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function SegmentedOptions<TValue extends string>({
  onChange,
  options,
  value
}: {
  readonly onChange: (value: TValue) => void;
  readonly options: ReadonlyArray<{ readonly label: string; readonly value: TValue }>;
  readonly value: TValue;
}): React.JSX.Element {
  return (
    <div className="grid gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-8 items-center justify-between rounded-md px-2 text-left text-sm",
            "transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option.value === value ? "bg-secondary text-foreground" : "text-muted-foreground"
          )}
        >
          <span>{option.label}</span>
          {option.value === value ? <Check className="size-4" /> : null}
        </button>
      ))}
    </div>
  );
}

function LinearStatusFilter({
  isLoading,
  linearOptions,
  onSelectedStateIdsChange,
  onTeamChange,
  selectedStateIds,
  selectedTeam,
  teams
}: {
  readonly isLoading: boolean;
  readonly linearOptions: LinearOptions | null;
  readonly onSelectedStateIdsChange: (stateIds: readonly string[]) => void;
  readonly onTeamChange: (teamId: string) => void;
  readonly selectedStateIds: readonly string[];
  readonly selectedTeam: LinearTeamOption | null;
  readonly teams: readonly LinearTeamOption[];
}): React.JSX.Element {
  if (isLoading) {
    return (
      <FilterSection title="Linear status">
        <p className="text-sm text-muted-foreground">Loading Linear...</p>
      </FilterSection>
    );
  }

  if (linearOptions?.configured === false) {
    return (
      <FilterSection title="Linear status">
        <p className="text-sm text-muted-foreground">LINEAR_API_KEY is not configured.</p>
      </FilterSection>
    );
  }

  if (teams.length === 0 || selectedTeam == null) {
    return (
      <FilterSection title="Linear status">
        <p className="text-sm text-muted-foreground">No Linear tickets on this board.</p>
      </FilterSection>
    );
  }

  return (
    <FilterSection title="Linear status">
      <div className="grid gap-2">
        <TeamSelector
          onTeamChange={onTeamChange}
          selectedTeam={selectedTeam}
          teams={teams}
        />
        <div className="grid max-h-48 gap-1 overflow-y-auto pr-1">
          {selectedTeam.states.map((state) => {
            const isSelected = selectedStateIds.includes(state.id);
            return (
              <button
                key={state.id}
                aria-pressed={isSelected}
                data-linear-state-id={state.id}
                type="button"
                onClick={() =>
                  onSelectedStateIdsChange(
                    isSelected
                      ? selectedStateIds.filter((stateId) => stateId !== state.id)
                      : [...selectedStateIds, state.id]
                  )
                }
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm",
                  "transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span className="flex size-4 items-center justify-center">
                  {isSelected ? <Check className="size-4" /> : null}
                </span>
                <span className="truncate">{state.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </FilterSection>
  );
}

function TeamSelector({
  onTeamChange,
  selectedTeam,
  teams
}: {
  readonly onTeamChange: (teamId: string) => void;
  readonly selectedTeam: LinearTeamOption;
  readonly teams: readonly LinearTeamOption[];
}): React.JSX.Element {
  if (teams.length === 1) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-2 py-1.5">
        <span className="text-xs text-muted-foreground">Using states from</span>
        <Badge variant="outline">{selectedTeam.key}</Badge>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">Using states from</span>
      <div className="flex flex-wrap gap-1">
        {teams.map((team) => (
          <Button
            key={team.id}
            size="sm"
            variant={team.id === selectedTeam.id ? "default" : "outline"}
            onClick={() => onTeamChange(team.id)}
          >
            {team.key}
          </Button>
        ))}
      </div>
    </div>
  );
}
