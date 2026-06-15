import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import type { PullRequestStatus, PullRequestStatusResult } from "@/api/pull-requests";

export function PullRequestStatusBadge({
  status
}: {
  readonly status: PullRequestStatusResult | null;
}): React.JSX.Element {
  const value = status?.status ?? "unknown";

  return (
    <Badge variant={getStatusVariant(value)} title={status?.error ?? undefined}>
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

function getStatusVariant(status: PullRequestStatus): BadgeProps["variant"] {
  switch (status) {
    case "closed":
      return "secondary";
    case "draft":
      return "warning";
    case "merged":
      return "success";
    case "open":
      return "accent";
    case "unknown":
      return "outline";
  }
}
