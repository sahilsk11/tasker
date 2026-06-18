import { Check, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import type { TaskState, TaskStateDefinition } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { TaskFilter } from "./task-filtering";

const filters: ReadonlyArray<{ readonly label: string; readonly value: TaskFilter }> = [
  { label: "All tasks", value: "all" },
  { label: "Has PR", value: "has-pr" },
  { label: "Has ticket", value: "has-ticket" }
];

export function TaskToolbar({
  filter,
  isFilterOpen,
  onFilterChange,
  onFilterOpenChange,
  onTaskStatesChange,
  onQueryChange,
  query,
  selectedTaskStates,
  taskStates
}: {
  readonly filter: TaskFilter;
  readonly isFilterOpen: boolean;
  readonly onFilterChange: (filter: TaskFilter) => void;
  readonly onFilterOpenChange: (isOpen: boolean) => void;
  readonly onTaskStatesChange: (states: readonly TaskState[]) => void;
  readonly onQueryChange: (query: string) => void;
  readonly query: string;
  readonly selectedTaskStates: readonly TaskState[];
  readonly taskStates: readonly TaskStateDefinition[];
}): React.JSX.Element {
  const hasPartialTaskStateFilter =
    selectedTaskStates.length > 0 && selectedTaskStates.length !== taskStates.length;
  const activeFilterCount =
    (filter === "all" ? 0 : 1) + (hasPartialTaskStateFilter ? 1 : 0);

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
              onFilterChange={onFilterChange}
              onTaskStatesChange={onTaskStatesChange}
              selectedTaskStates={selectedTaskStates}
              taskStates={taskStates}
            />
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

function FilterContent({
  filter,
  onFilterChange,
  onTaskStatesChange,
  selectedTaskStates,
  taskStates
}: {
  readonly filter: TaskFilter;
  readonly onFilterChange: (filter: TaskFilter) => void;
  readonly onTaskStatesChange: (states: readonly TaskState[]) => void;
  readonly selectedTaskStates: readonly TaskState[];
  readonly taskStates: readonly TaskStateDefinition[];
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
      <TaskStateFilter
        onSelectedStatesChange={onTaskStatesChange}
        selectedStates={selectedTaskStates}
        states={taskStates}
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

function TaskStateFilter({
  onSelectedStatesChange,
  selectedStates,
  states
}: {
  readonly onSelectedStatesChange: (states: readonly TaskState[]) => void;
  readonly selectedStates: readonly TaskState[];
  readonly states: readonly TaskStateDefinition[];
}): React.JSX.Element {
  if (states.length === 0) {
    return (
      <FilterSection title="Task state">
        <p className="text-sm text-muted-foreground">Loading states...</p>
      </FilterSection>
    );
  }

  return (
    <FilterSection title="Task state">
      <div className="grid max-h-48 gap-1 overflow-y-auto pr-1">
        {states.map((state) => {
          const isSelected = selectedStates.includes(state.value);
          return (
            <button
              key={state.value}
              aria-pressed={isSelected}
              data-task-state={state.value}
              type="button"
              onClick={() =>
                onSelectedStatesChange(
                  isSelected
                    ? selectedStates.filter((value) => value !== state.value)
                    : [...selectedStates, state.value]
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
              <span className="truncate">{state.label}</span>
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}
