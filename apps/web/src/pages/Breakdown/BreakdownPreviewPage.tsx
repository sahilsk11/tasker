import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { graphlib, layout } from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import {
  Background,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, CheckCircle2, GitBranch, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  acceptTaskBreakdown,
  getTask,
  validateTaskBreakdown,
  type ApiAcceptTaskBreakdownResult,
  type ApiTask,
  type ApiTaskBreakdown,
  type ApiTaskBreakdownItem,
  type ApiTaskBreakdownWarning,
  type ApiTaskBreakdownValidationResult
} from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BreakdownFlowData = {
  readonly item: ApiTaskBreakdownItem;
};

const nodeWidth = 280;
const nodeHeight = 154;

export function BreakdownPreviewPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const uri = searchParams.get("uri") ?? "";
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const validationQuery = useQuery({
    enabled: uri.length > 0,
    queryFn: () => validateTaskBreakdown(uri),
    queryKey: ["task-breakdown-validation", uri],
    retry: false
  });
  const breakdown = validationQuery.data?.breakdown ?? null;
  const parentTaskQuery = useQuery({
    enabled: breakdown != null,
    queryFn: () => getTask(breakdown?.taskId ?? ""),
    queryKey: ["task", breakdown?.taskId]
  });
  const acceptMutation = useMutation({
    mutationFn: () => acceptTaskBreakdown(uri),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["task-breakdown-validation", uri]
        }),
        queryClient.invalidateQueries({
          queryKey: ["tasks"]
        }),
        queryClient.invalidateQueries({
          queryKey: ["task", result.taskId]
        })
      ]);
    }
  });
  const selectedItem =
    breakdown?.items.find((item) => item.id === selectedItemId) ??
    breakdown?.items[0] ??
    null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="min-w-0 border-b border-border/70 pb-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch className="size-5 shrink-0 text-info" />
              <h1 className="truncate text-xl font-semibold tracking-normal">
                {parentTaskQuery.data?.title ?? "Breakdown preview"}
              </h1>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {getHeaderSubtitle(validationQuery.data, uri)}
            </p>
          </div>
        </header>

        <BreakdownContent
          acceptResult={acceptMutation.data ?? null}
          breakdown={breakdown}
          error={getErrorMessage(validationQuery.error)}
          isLoading={validationQuery.isLoading}
          onNodeSelect={setSelectedItemId}
          parentTask={parentTaskQuery.data ?? null}
          selectedItem={selectedItem}
          validation={validationQuery.data ?? null}
          acceptDisabled={validationQuery.data?.valid !== true || acceptMutation.isSuccess}
          acceptPending={acceptMutation.isPending}
          onAccept={() => acceptMutation.mutate()}
        />
      </div>
    </main>
  );
}

function BreakdownContent({
  acceptResult,
  breakdown,
  error,
  isLoading,
  onNodeSelect,
  parentTask,
  selectedItem,
  validation,
  acceptDisabled,
  acceptPending,
  onAccept
}: {
  readonly acceptResult: ApiAcceptTaskBreakdownResult | null;
  readonly breakdown: ApiTaskBreakdown | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly onNodeSelect: (itemId: string) => void;
  readonly parentTask: ApiTask | null;
  readonly selectedItem: ApiTaskBreakdownItem | null;
  readonly validation: ApiTaskBreakdownValidationResult | null;
  readonly acceptDisabled: boolean;
  readonly acceptPending: boolean;
  readonly onAccept: () => void;
}): React.JSX.Element {
  if (isLoading) {
    return <StatusPanel icon={<Loader2 className="size-5 animate-spin" />} text="Loading breakdown..." />;
  }

  if (error != null) {
    return <StatusPanel icon={<AlertTriangle className="size-5" />} text={error} />;
  }

  if (validation == null) {
    return <StatusPanel icon={<AlertTriangle className="size-5" />} text="No breakdown loaded." />;
  }

  if (!validation.valid || breakdown == null) {
    return <InvalidBreakdown errors={validation.errors} />;
  }

  return (
    <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-h-[560px] overflow-hidden rounded-lg border border-border bg-card">
        <BreakdownGraph
          breakdown={breakdown}
          selectedItemId={selectedItem?.id ?? null}
          onNodeSelect={onNodeSelect}
        />
      </div>

      <aside className="flex min-h-0 flex-col gap-4">
        <AcceptPanel disabled={acceptDisabled} isPending={acceptPending} onAccept={onAccept} />
        <ParentSummary parentTask={parentTask} summary={breakdown.summary} />
        {validation.warnings.length > 0 ? (
          <WarningsPanel warnings={validation.warnings} />
        ) : null}
        <SelectedItemPanel item={selectedItem} />
        {acceptResult == null ? null : <AcceptResultPanel result={acceptResult} />}
      </aside>
    </section>
  );
}

function BreakdownGraph({
  breakdown,
  selectedItemId,
  onNodeSelect
}: {
  readonly breakdown: ApiTaskBreakdown;
  readonly selectedItemId: string | null;
  readonly onNodeSelect: (itemId: string) => void;
}): React.JSX.Element {
  const { edges, nodes } = useMemo(
    () => createLayout(breakdown, selectedItemId),
    [breakdown, selectedItemId]
  );
  const handleNodeClick: NodeMouseHandler = (_, node) => {
    onNodeSelect(node.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ includeHiddenNodes: false, padding: 0.16 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeClick={handleNodeClick}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={1.45}
    >
      <Background color="#2a2a30" gap={24} />
    </ReactFlow>
  );
}

function createLayout(
  breakdown: ApiTaskBreakdown,
  selectedItemId: string | null
): {
  readonly edges: FlowEdge[];
  readonly nodes: Array<FlowNode<BreakdownFlowData>>;
} {
  const graph = new graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  graph.setGraph({
    marginx: 28,
    marginy: 28,
    nodesep: 44,
    rankdir: "TB",
    ranksep: 82
  });
  graph.setDefaultEdgeLabel(() => ({}));

  breakdown.items.forEach((item) => {
    graph.setNode(item.id, { height: nodeHeight, width: nodeWidth });
  });
  breakdown.items.forEach((item) => {
    item.dependsOn.forEach((dependencyId) => {
      graph.setEdge(dependencyId, item.id);
    });
  });

  layout(graph);

  return {
    edges: breakdown.items.flatMap((item) =>
      item.dependsOn.map((dependencyId) => ({
        animated: false,
        id: `${dependencyId}-${item.id}`,
        selectable: false,
        source: dependencyId,
        target: item.id,
        type: "smoothstep"
      }))
    ),
    nodes: breakdown.items.map((item, index) => {
      const positioned = graph.node(item.id);
      const isSelected = selectedItemId === item.id || (selectedItemId == null && index === 0);

      return {
        data: {
          item,
          label: <BreakdownNode item={item} index={index} isSelected={isSelected} />
        },
        draggable: false,
        id: item.id,
        position: {
          x: (positioned.x ?? 0) - nodeWidth / 2,
          y: (positioned.y ?? 0) - nodeHeight / 2
        },
        selectable: false,
        style: {
          background: isSelected ? "#1f2437" : "#171719",
          border: isSelected ? "1.5px solid #6e79e6" : "1px solid #2a2a30",
          borderRadius: 8,
          color: "#f4f4f5",
          minHeight: nodeHeight,
          padding: 0,
          textAlign: "left",
          width: nodeWidth
        }
      };
    })
  };
}

function BreakdownNode({
  index,
  isSelected,
  item
}: {
  readonly index: number;
  readonly isSelected: boolean;
  readonly item: ApiTaskBreakdownItem;
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[154px] flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">
            Step {index + 1}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5">
            {item.title}
          </div>
        </div>
        {isSelected ? <Badge variant="outline">Open</Badge> : null}
      </div>
      <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
        {item.description}
      </p>
      <div className="mt-auto min-w-0 truncate font-mono text-[11px] text-muted-foreground">
        {item.dependsOn.length === 0 ? "No dependencies" : item.dependsOn.join(", ")}
      </div>
    </div>
  );
}

function AcceptPanel({
  disabled,
  isPending,
  onAccept
}: {
  readonly disabled: boolean;
  readonly isPending: boolean;
  readonly onAccept: () => void;
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Review breakdown</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Create these subtasks under the parent task.
          </p>
        </div>
        <Button className="shrink-0" disabled={disabled || isPending} onClick={onAccept}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Accept
        </Button>
      </div>
    </section>
  );
}

function ParentSummary({
  parentTask,
  summary
}: {
  readonly parentTask: ApiTask | null;
  readonly summary: string;
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Summary</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{summary}</p>
      {parentTask?.description == null ? null : (
        <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
          {parentTask.description}
        </p>
      )}
    </section>
  );
}

function WarningsPanel({
  warnings
}: {
  readonly warnings: readonly ApiTaskBreakdownWarning[];
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-warning/50 bg-warning/10 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-warning">
        <AlertTriangle className="size-4" />
        Warnings
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-5 text-foreground">
        {warnings.map((warning, index) => (
          <li key={`${warning.code}-${String(index)}`}>{warning.message}</li>
        ))}
      </ul>
    </section>
  );
}

function SelectedItemPanel({
  item
}: {
  readonly item: ApiTaskBreakdownItem | null;
}): React.JSX.Element {
  if (item == null) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Select a node to inspect the subtask.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Selected subtask</h2>
        <Badge variant="outline">{item.id}</Badge>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-6">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
      <div className="mt-4 border-t border-border pt-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Dependencies
        </div>
        <p className="mt-1 font-mono text-xs leading-5 text-foreground">
          {item.dependsOn.length === 0 ? "None" : item.dependsOn.join(", ")}
        </p>
      </div>
    </section>
  );
}

function AcceptResultPanel({
  result
}: {
  readonly result: ApiAcceptTaskBreakdownResult;
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-success/50 bg-success/10 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-success">
        <CheckCircle2 className="size-4" />
        Created {result.createdSubtasks.length} subtasks
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-5">
        {result.createdSubtasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </section>
  );
}

function InvalidBreakdown({
  errors
}: {
  readonly errors: ApiTaskBreakdownValidationResult["errors"];
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-destructive/60 bg-destructive/10 p-5">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="size-5" />
        Invalid breakdown
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {errors.map((error) => (
          <li key={`${error.path}-${error.message}`}>
            <code className="rounded bg-background px-1.5 py-0.5">{error.path || "root"}</code>
            <span className="ml-2 text-muted-foreground">{error.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPanel({
  icon,
  text
}: {
  readonly icon: React.ReactNode;
  readonly text: string;
}): React.JSX.Element {
  return (
    <section className="grid min-h-[520px] place-items-center rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {text}
      </div>
    </section>
  );
}

function getHeaderSubtitle(
  validation: ApiTaskBreakdownValidationResult | undefined,
  uri: string
): string {
  if (uri.length === 0) {
    return "Missing breakdown URI";
  }

  if (validation?.breakdown == null) {
    return uri;
  }

  return `${String(validation.breakdown.items.length)} proposed subtasks`;
}

function getErrorMessage(error: unknown): string | null {
  if (error == null) {
    return null;
  }

  return error instanceof Error ? error.message : "Failed to load breakdown.";
}
