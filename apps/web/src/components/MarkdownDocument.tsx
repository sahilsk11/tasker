import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function MarkdownDocument({
  className,
  mode,
  onChange,
  previewClassName,
  textareaClassName,
  value
}: {
  readonly className?: string;
  readonly mode: "edit" | "view";
  readonly onChange: (value: string) => void;
  readonly previewClassName?: string;
  readonly textareaClassName?: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div className={cn("min-h-0 flex-1", className)}>
      {mode === "edit" ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className={cn(
            "min-h-0 h-full resize-none rounded-none border-0 bg-background p-5 font-mono text-sm leading-6 focus-visible:ring-0",
            textareaClassName
          )}
        />
      ) : (
        <MarkdownPreview
          content={value}
          {...(previewClassName === undefined ? {} : { className: previewClassName })}
        />
      )}
    </div>
  );
}

export function MarkdownPreview({
  className,
  content
}: {
  readonly className?: string;
  readonly content: string;
}): React.JSX.Element {
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto px-5 py-6", className)}>
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
            code: ({ children, className: codeClassName }) => (
              <code
                className={
                  codeClassName ??
                  "rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]"
                }
              >
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

export function MarkdownDocumentStatus({
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
