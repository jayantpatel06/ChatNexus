import type { Message } from "@shared/schema";

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

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
