import type { Message } from "@shared/schema";

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);
const URL_ONLY_MESSAGE_PATTERN = /^https?:\/\/[^\s]+$/i;

export const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const GIF_MEDIA_URL_PATTERN = /\.gif(\?.*)?$/i;
export const IMAGE_MEDIA_URL_PATTERN =
  /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
export const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;

export function isImageMessageUrl(url: string): boolean {
  return IMAGE_MEDIA_URL_PATTERN.test(url) || TENOR_MEDIA_URL_PATTERN.test(url);
}

export function isVideoMessageUrl(url: string): boolean {
  return VIDEO_MEDIA_URL_PATTERN.test(url);
}

export function isStandaloneMediaUrl(url: string): boolean {
  return (
    TENOR_MEDIA_URL_PATTERN.test(url) ||
    IMAGE_MEDIA_URL_PATTERN.test(url) ||
    VIDEO_MEDIA_URL_PATTERN.test(url)
  );
}

export function getSidebarMessagePreview(message: unknown): string {
  if (typeof message !== "string") {
    return "";
  }

  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return "";
  }

  if (normalizedMessage === "Sent an attachment") {
    return normalizedMessage;
  }

  const isStandaloneUrl = /^https?:\/\/[^\s]+$/i.test(normalizedMessage);
  if (isStandaloneUrl && isStandaloneMediaUrl(normalizedMessage)) {
    return "Sent an attachment";
  }

  return normalizedMessage;
}

type ReplyPreviewSource = Pick<Message, "message" | "deletedAt">;
type ReplyPreviewKind = "gif" | "image" | "link" | "text" | "message" | "deleted";

export function stripConversationAttachments(messages: Message[]): Message[] {
  return messages.flatMap((message) => {
    const attachments = message.attachments ?? [];

    if (attachments.length === 0) {
      return [{ ...message }];
    }

    if (!message.message || message.message === "Sent an attachment") {
      return [];
    }

    return [
      {
        ...message,
        attachments: [],
      },
    ];
  });
}

export function sanitizeExternalUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function getReplyPreviewKind(
  message: ReplyPreviewSource | null | undefined,
): { kind: ReplyPreviewKind; text: string } | null {
  if (!message) {
    return null;
  }

  if (message.deletedAt) {
    return { kind: "deleted", text: "Message deleted" };
  }

  const trimmedMessage = message.message?.trim() ?? "";

  if (!trimmedMessage) {
    return { kind: "message", text: "Message" };
  }

  const safeUrl = URL_ONLY_MESSAGE_PATTERN.test(trimmedMessage)
    ? sanitizeExternalUrl(trimmedMessage)
    : null;

  if (safeUrl) {
    if (
      TENOR_MEDIA_URL_PATTERN.test(safeUrl) ||
      GIF_MEDIA_URL_PATTERN.test(safeUrl)
    ) {
      return { kind: "gif", text: "" };
    }

    if (IMAGE_MEDIA_URL_PATTERN.test(safeUrl)) {
      return { kind: "image", text: "" };
    }

    return { kind: "link", text: "" };
  }

  return { kind: "text", text: trimmedMessage };
}

export function getReplyPreviewText(
  message: ReplyPreviewSource | null | undefined,
): string {
  const preview = getReplyPreviewKind(message);

  if (!preview) {
    return "";
  }

  switch (preview.kind) {
    case "gif":
      return "Sent a GIF";
    case "image":
      return "Sent an image";
    case "link":
      return "Sent a link";
    default:
      return preview.text;
  }
}

