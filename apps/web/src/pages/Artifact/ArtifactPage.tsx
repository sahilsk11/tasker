import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Code2, Pencil, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
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
        {renderMarkdownBlocks(content)}
      </div>
    </div>
  );
}

function renderMarkdownBlocks(content: string): ReactNode {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  function flushParagraph(): void {
    if (paragraph.length === 0) {
      return;
    }

    blocks.push(
      <p key={`p-${String(blocks.length)}`} className="mb-4 text-muted-foreground">
        {paragraph.join(" ")}
      </p>
    );
    paragraph = [];
  }

  function flushList(): void {
    if (list.length === 0) {
      return;
    }

    blocks.push(
      <ul
        key={`ul-${String(blocks.length)}`}
        className="mb-4 list-disc space-y-1 pl-6"
      >
        {list.map((item, index) => (
          <li key={`${String(index)}-${item}`}>{item}</li>
        ))}
      </ul>
    );
    list = [];
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (code == null) {
        flushParagraph();
        flushList();
        code = [];
      } else {
        blocks.push(
          <CodeBlock key={`code-${String(blocks.length)}`} content={code.join("\n")} />
        );
        code = null;
      }
      continue;
    }

    if (code != null) {
      code.push(line);
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const headingMarks = heading?.[1];
    const headingText = heading?.[2];
    if (headingMarks != null && headingText != null) {
      flushParagraph();
      flushList();
      blocks.push(renderHeading(headingMarks.length, headingText, blocks.length));
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    const listItemText = listItem?.[1];
    if (listItemText != null) {
      flushParagraph();
      list.push(listItemText);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  if (code != null) {
    blocks.push(
      <CodeBlock key={`code-${String(blocks.length)}`} content={code.join("\n")} />
    );
  }

  return blocks.length === 0 ? (
    <p className="text-muted-foreground">This Markdown file is empty.</p>
  ) : (
    blocks
  );
}

function renderHeading(
  level: number,
  text: string,
  key: number
): React.JSX.Element {
  if (level === 1) {
    return (
      <h1 key={`h-${String(key)}`} className="mb-4 text-3xl font-semibold leading-tight">
        {text}
      </h1>
    );
  }

  if (level === 2) {
    return (
      <h2
        key={`h-${String(key)}`}
        className="mb-3 mt-6 text-2xl font-semibold leading-tight"
      >
        {text}
      </h2>
    );
  }

  return (
    <h3
      key={`h-${String(key)}`}
      className="mb-2 mt-5 text-lg font-semibold leading-snug"
    >
      {text}
    </h3>
  );
}

function CodeBlock({ content }: { readonly content: string }): React.JSX.Element {
  return (
    <pre className="mb-4 overflow-auto rounded-md border border-border bg-background p-4 text-sm leading-6 text-foreground">
      <code>
        <Code2 className="mb-2 size-4 text-muted-foreground" />
        {content}
      </code>
    </pre>
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
