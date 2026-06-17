import {
  ClipboardCheck,
  Code2,
  ListTree,
  MapIcon,
  MessageSquareText,
  Search,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const taskActionIcons: Record<string, LucideIcon> = {
  breakdown: ListTree,
  "clipboard-check": ClipboardCheck,
  "code-2": Code2,
  code_review: ClipboardCheck,
  implement: Code2,
  investigate: Search,
  "list-tree": ListTree,
  map: MapIcon,
  "message-square-text": MessageSquareText,
  new_session: MessageSquareText,
  plan: MapIcon,
  search: Search,
  workflow: Workflow
};
