import type { MessageReactionWithUser } from "@shared/schema";

export const SOCKET_CONFIG = {
  PRESENCE_BROADCAST_DELAY_MS: 200,
  OFFLINE_GRACE_PERIOD_MS: 2000,
  GUEST_DELETION_GRACE_PERIOD_MS: 24 * 60 * 60 * 1000,
  CLEANUP_INTERVAL_MS: 30 * 1000,
  GLOBAL_CHAT_MAX_AGE_MS: 30 * 60 * 1000,
  EPHEMERAL_CHAT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  ATTACHMENT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
};

export interface PrivateMessagePayload {
  receiverId: number;
  message?: string;
  clientMessageId?: string;
  replyToId?: number;
  attachment?: {
    url: string;
    filename: string;
    fileType: string;
  };
}

export interface GlobalMessagePayload {
  message: string;
}

export interface RandomChatRequestPayload {
  interests?: unknown;
  interestsMatchingEnabled?: unknown;
  maxWaitDurationSeconds?: unknown;
  preserveQueuePosition?: unknown;
  searchMessage?: unknown;
}

export interface RandomChatMessagePayload {
  message?: string;
}

export interface TypingPayload {
  receiverId: number;
}

export interface ReactionPayload {
  messageId: number;
  emoji: string;
}

export interface DeleteMessagePayload {
  messageId: number;
}

export interface ReactionSyncPayload {
  messageId: number;
  senderId: number;
  receiverId: number;
  reactions: MessageReactionWithUser[];
}

export type RandomChatPreferences = {
  interests: string[];
  interestsMatchingEnabled: boolean;
  maxWaitDurationSeconds: number;
};

export type RandomChatQueueEntry = RandomChatPreferences & {
  queuedAt: number;
  userId: number;
};

export type RandomChatSession = {
  startedAt: number;
  userAId: number;
  userBId: number;
};
