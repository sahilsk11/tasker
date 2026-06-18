import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PullRequestStatus, PullRequestStatusResult } from "@/api/pull-requests";

export function PullRequestStatusBadge({
  className,
  status
}: {
  readonly className?: string;
  readonly status: PullRequestStatusResult | null;
}): React.JSX.Element {
  const value = status?.status ?? "unknown";

  return (
    <Badge
      className={cn("border", getStatusClassName(value), className)}
      variant="outline"
      title={status?.error ?? undefined}
    >
      {getStatusLabel(value)}
    </Badge>
  );
}

function getStatusLabel(status: PullRequestStatus): string {
  switch (status) {
    case "closed":
      return "Closed";
    case "draft":
      return "Draft";
    case "merged":
      return "Merged";
    case "open":
      return "Open";
    case "unknown":
      return "Status unknown";
  }
}

function getStatusClassName(status: PullRequestStatus): string {
  switch (status) {
    case "closed":
      return "border-[#f85149]/30 bg-[#f85149]/10 text-[#ff7b72]";
    case "draft":
      return "border-[#8b949e]/30 bg-[#8b949e]/10 text-[#8b949e]";
    case "merged":
      return "border-[#a371f7]/30 bg-[#a371f7]/10 text-[#d2a8ff]";
    case "open":
      return "border-[#3fb950]/30 bg-[#3fb950]/10 text-[#56d364]";
    case "unknown":
      return "border-border bg-transparent text-muted-foreground";
  }
}
