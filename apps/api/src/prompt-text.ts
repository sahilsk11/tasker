import type { ChatAttachment } from "./domain/chat-attachment.js";

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildAttachmentHintText(
  attachments: readonly ChatAttachment[]
): string {
  if (attachments.length === 0) {
    return "";
  }

  const lines = attachments.map((attachment) => (
    `<attachment kind="${escapeXmlAttribute(attachment.kind)}" `
    + `mime_type="${escapeXmlAttribute(attachment.mimeType)}" `
    + `path="${escapeXmlAttribute(attachment.absolutePath)}" `
    + `project_path="${escapeXmlAttribute(attachment.relativePath)}" `
    + `size_bytes="${String(attachment.size)}" `
    + `display_name="${escapeXmlAttribute(attachment.displayName)}" />`
  ));

  return ["<kanna-attachments>", ...lines, "</kanna-attachments>"].join("\n");
}

export function buildPromptText(
  content: string,
  attachments: readonly ChatAttachment[]
): string {
  const attachmentHint = buildAttachmentHintText(attachments);
  if (attachmentHint.length === 0) {
    return content.trim();
  }

  return [content.trim() || "Please inspect the attached files.", attachmentHint]
    .join("\n\n")
    .trim();
}
