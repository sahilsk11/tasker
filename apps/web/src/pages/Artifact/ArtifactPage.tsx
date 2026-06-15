import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router";
import remarkGfm from "remark-gfm";
import { getTaskArtifactContent } from "@/api/tasks";
import type { ApiArtifactContent } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-none border-0 bg-background p-5 font-mono text-sm leading-6 focus-visible:ring-0"
        />
      ) : (
        <MarkdownPreview content={draft} />
      )}
    </div>
  );
}

function MarkdownPreview({ content }: { readonly content: string }): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-5 py-6">
      <div className="mx-auto w-full max-w-4xl text-sm leading-7 text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ children, ...props }) => (
              <a
                {...props}
                className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                rel="noreferrer"
                target="_blank"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="mb-4 border-l-2 border-border pl-4 text-muted-foreground">
                {children}
              </blockquote>
            ),
            code: ({ children, className }) => (
              <code className={className ?? "rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]"}>
                {children}
              </code>
            ),
            h1: ({ children }) => (
              <h1 className="mb-4 text-3xl font-semibold leading-tight">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-3 mt-6 text-2xl font-semibold leading-tight">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-2 mt-5 text-lg font-semibold leading-snug">
                {children}
              </h3>
            ),
            hr: () => <hr className="my-6 border-border" />,
            li: ({ children }) => <li>{children}</li>,
            ol: ({ children }) => (
              <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>
            ),
            p: ({ children }) => (
              <p className="mb-4 text-muted-foreground">{children}</p>
            ),
            pre: ({ children }) => (
              <pre className="mb-4 overflow-auto rounded-md border border-border bg-background p-4 text-sm leading-6 text-foreground">
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <div className="mb-4 overflow-auto rounded-md border border-border">
                <table className="w-full border-collapse text-left">{children}</table>
              </div>
            ),
            tbody: ({ children }) => <tbody>{children}</tbody>,
            td: ({ children }) => (
              <td className="border-t border-border px-3 py-2 align-top text-muted-foreground">
                {children}
              </td>
            ),
            th: ({ children }) => (
              <th className="border-b border-border bg-secondary/50 px-3 py-2 font-medium">
                {children}
              </th>
            ),
            thead: ({ children }) => <thead>{children}</thead>,
            tr: ({ children }) => <tr>{children}</tr>,
            ul: ({ children }) => (
              <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
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
