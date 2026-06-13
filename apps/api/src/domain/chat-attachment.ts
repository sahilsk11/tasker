export type ChatAttachmentKind = "file" | "image";

export type ChatAttachment = {
  readonly absolutePath: string;
  readonly contentUrl: string;
  readonly displayName: string;
  readonly id: string;
  readonly kind: ChatAttachmentKind;
  readonly mimeType: string;
  readonly relativePath: string;
  readonly size: number;
};
