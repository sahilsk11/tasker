import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getTaskArtifactContent } from "@/api/tasks";
import type { ApiArtifactContent } from "@/api/tasks";
import { MarkdownDocument } from "@/components/MarkdownDocument";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ArtifactPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { artifactId, taskId } = useParams<{
    artifactId: string;
    taskId: string;
  }>();

  const contentQuery = useQuery({
    enabled: taskId != null && artifactId != null,
    queryFn: () => getTaskArtifactContent(taskId ?? "", artifactId ?? ""),
    queryKey: ["task-artifact-content", taskId, artifactId]
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to tasks"
              onClick={() => {
                void navigate("/");
              }}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">
                {contentQuery.data?.artifact.label ?? "Artifact"}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {contentQuery.data?.fileName ?? "Loading artifact..."}
              </p>
            </div>
          </div>
          {contentQuery.data == null ? null : (
            <Badge variant="outline">{contentQuery.data.kind}</Badge>
          )}
        </header>

        <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          {contentQuery.isLoading ? <ArtifactStatus>Loading artifact...</ArtifactStatus> : null}
          {contentQuery.isError ? (
            <ArtifactStatus>
              {contentQuery.error instanceof Error
                ? contentQuery.error.message
                : "Failed to load artifact."}
            </ArtifactStatus>
          ) : null}
          {contentQuery.isSuccess ? (
            <ArtifactRenderer artifactContent={contentQuery.data} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ArtifactRenderer({
  artifactContent
}: {
  readonly artifactContent: ApiArtifactContent;
}): React.JSX.Element {
  if (artifactContent.content == null) {
    return (
      <ArtifactStatus>
        Tasker does not have a renderer for {artifactContent.fileName}.
      </ArtifactStatus>
    );
  }

  if (artifactContent.kind === "markdown") {
    return <MarkdownArtifact content={artifactContent.content} />;
  }

  if (artifactContent.kind === "html") {
    return (
      <iframe
        title={artifactContent.fileName}
        sandbox=""
        srcDoc={artifactContent.content}
        className="h-full min-h-[calc(100vh-9rem)] w-full bg-white"
      />
    );
  }

  if (artifactContent.kind === "image") {
    return (
      <div className="flex h-full min-h-[calc(100vh-9rem)] overflow-auto bg-black/30 p-4">
        <img
          src={`data:${artifactContent.contentType};base64,${artifactContent.content}`}
          alt={artifactContent.artifact.label}
          className="m-auto max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <ArtifactStatus>
      Tasker does not have a renderer for {artifactContent.fileName}.
    </ArtifactStatus>
  );
}

function MarkdownArtifact({ content }: { readonly content: string }): React.JSX.Element {
  const [draft, setDraft] = useState(content);
  const [mode, setMode] = useState<"edit" | "view">("view");

  useEffect(() => {
    setDraft(content);
  }, [content]);

  return (
    <div className="flex h-full min-h-[calc(100vh-9rem)] flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border px-3 py-2">
        {mode === "view" ? (
          <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>
            <Pencil className="size-4" />
            Edit
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={() => setMode("view")}>
            <Save className="size-4" />
            Save
          </Button>
        )}
      </div>
      {mode === "edit" ? (
        <MarkdownDocument
          value={draft}
          onChange={setDraft}
          mode="edit"
          className="flex min-h-0 flex-1"
        />
      ) : (
        <MarkdownDocument
          value={draft}
          onChange={setDraft}
          mode="view"
          className="flex min-h-0 flex-1"
        />
      )}
    </div>
  );
}

function ArtifactStatus({
  children
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
