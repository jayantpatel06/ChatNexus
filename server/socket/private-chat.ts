import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  insertMessageSchema,
  insertAttachmentSchema,
  type MessageReplyPreview,
} from "@shared/schema";
import { storage } from "../storage";
import { getConversationId } from "../db/message";
import { enqueueAndDeliver as enqueueNotification } from "../lib/notification-service";
import { shouldSendPushToUser, emitSidebarUsers } from "./connection";
import type {
  PrivateMessagePayload,
  ReactionPayload,
  DeleteMessagePayload,
  TypingPayload,
  ReactionSyncPayload,
} from "./types";

export const recentReactionToggleTimestamps = new Map<string, number>();
const REACTION_DEDUP_WINDOW_MS = 600;

const privateMessageAttachmentSchema = insertAttachmentSchema.omit({
  messageId: true,
});

export function isDuplicateReactionToggle(
  userId: number,
  messageId: number,
  emoji: string,
): boolean {
  const now = Date.now();
  const key = `${userId}:${messageId}:${emoji}`;
  const lastSeenAt = recentReactionToggleTimestamps.get(key);

  if (lastSeenAt && now - lastSeenAt < REACTION_DEDUP_WINDOW_MS) {
    return true;
  }

  recentReactionToggleTimestamps.set(key, now);

  if (recentReactionToggleTimestamps.size > 500) {
    for (const [existingKey, existingSeenAt] of recentReactionToggleTimestamps) {
      if (now - existingSeenAt >= REACTION_DEDUP_WINDOW_MS) {
        recentReactionToggleTimestamps.delete(existingKey);
      }
    }
  }

  return false;
}

export async function handlePrivateMessage(
  socket: Socket,
  io: SocketIOServer,
  data: PrivateMessagePayload,
): Promise<void> {
  const clientMessageId = data.clientMessageId;

  try {
    if (!socket.userId || !data.receiverId || (!data.message && !data.attachment)) {
      throw new Error("Invalid private message payload");
    }

    if (!data.message && !data.attachment?.url) {
      throw new Error("Private messages need text or an attachment");
    }

    // Acknowledge receipt to sender immediately (they already have optimistic message)
    socket.emit("message_sent", { clientMessageId });

    // Persist and deliver in background (fire-and-forget)
    persistAndDeliverMessage(socket, io, data, clientMessageId);
  } catch (error) {
    console.error("Socket.IO private_message error:", error);
    if (clientMessageId) {
      socket.emit("message_save_error", {
        clientMessageId,
        error: "Failed to send message",
      });
    }
  }
}

export async function persistAndDeliverMessage(
  socket: Socket,
  io: SocketIOServer,
  data: PrivateMessagePayload,
  clientMessageId: string | undefined,
): Promise<void> {
  try {
    const {
      blockByUser1: blockBySender,
      blockByUser2: blockByReceiver,
    } = await storage.getBlockStateBetweenUsers(
      socket.userId,
      data.receiverId,
    );
    if (blockBySender || blockByReceiver) {
      const errorMsg = blockBySender
        ? "You blocked this user"
        : "This user has blocked you";
      socket.emit("message_save_error", {
        clientMessageId,
        error: errorMsg,
      });
      return;
    }

    // Build reply preview if needed
    let replyPreview: MessageReplyPreview | null = null;
    if (data.replyToId) {
      const replyTarget = await storage.getConversationReplyPreview(
        data.replyToId,
        socket.userId,
      );
      if (replyTarget) {
        replyPreview = replyTarget;
      }
    }

    const conversationId = getConversationId(socket.userId, data.receiverId);

    const validatedMessage = insertMessageSchema.parse({
      senderId: socket.userId,
      receiverId: data.receiverId,
      conversationId,
      replyToId: data.replyToId,
      message: data.message || "Sent an attachment",
    });

    const validatedAttachment = data.attachment?.url
      ? privateMessageAttachmentSchema.parse({
          url: data.attachment.url,
          filename: data.attachment.filename,
          fileType: data.attachment.fileType,
        })
      : undefined;

    const persistedMessage = await storage.createMessageWithAttachments(
      validatedMessage,
      validatedAttachment,
      replyPreview,
    );

    // Deliver to receiver (they see the real message directly)
    io.to(`user:${data.receiverId}`).emit("new_message", {
      message: persistedMessage,
    });

    // Confirm to sender (replaces their optimistic message with real one)
    socket.emit("message_confirmed", {
      message: persistedMessage,
      clientMessageId,
    });

    // Check if we need to send a push notification
    const areFriends = await storage.areFriends(
      socket.userId,
      data.receiverId,
    );
    const senderUser = await storage.getUser(socket.userId);
    const pushEligible = shouldSendPushToUser(data.receiverId);

    if (areFriends && pushEligible) {
      console.log(
        `[Notification] Enqueuing push: sender=${socket.userId} receiver=${data.receiverId}`,
      );
      await enqueueNotification({
        senderId: socket.userId,
        senderUsername: senderUser?.username ?? "New message",
        receiverId: data.receiverId,
        message: persistedMessage,
      });
    } else if (process.env.NODE_ENV !== "production" || !areFriends) {
      console.log(
        `[Notification] Push skipped: sender=${socket.userId} receiver=${data.receiverId} (friends=${areFriends}, eligible=${pushEligible})`,
      );
    }
  } catch (error) {
    console.error("Message persistence/delivery error:", error);
    socket.emit("message_save_error", {
      clientMessageId,
      error: "Failed to save message",
    });
  }
}

export function handleTypingStart(
  socket: Socket,
  io: SocketIOServer,
  data: TypingPayload,
): void {
  if (socket.userId && data.receiverId) {
    io.to(`user:${data.receiverId}`).emit("user_typing", {
      userId: socket.userId,
      isTyping: true,
    });
  }
}

export function handleTypingStop(
  socket: Socket,
  io: SocketIOServer,
  data: TypingPayload,
): void {
  if (socket.userId && data.receiverId) {
    io.to(`user:${data.receiverId}`).emit("user_typing", {
      userId: socket.userId,
      isTyping: false,
    });
  }
}

export function handleToggleReaction(
  socket: Socket,
  io: SocketIOServer,
  data: ReactionPayload,
): void {
  if (!socket.userId || !data.messageId || !data.emoji) {
    socket.emit("reaction_error", {
      messageId: data.messageId,
      error: "Invalid reaction data",
    });
    return;
  }

  if (isDuplicateReactionToggle(socket.userId, data.messageId, data.emoji)) {
    return;
  }

  void persistAndDeliverReaction(socket, io, data);
}

export function handleDeleteMessage(
  socket: Socket,
  io: SocketIOServer,
  data: DeleteMessagePayload,
): void {
  if (!socket.userId || !data.messageId) {
    socket.emit("delete_error", {
      messageId: data.messageId,
      error: "Invalid delete data",
    });
    return;
  }

  void persistAndDeliverDelete(socket, io, data);
}

export async function persistAndDeliverReaction(
  socket: Socket,
  io: SocketIOServer,
  data: ReactionPayload,
): Promise<void> {
  try {
    const existingMessage = await storage.getConversationMessageMeta(
      data.messageId,
      socket.userId,
    );

    if (!existingMessage) {
      socket.emit("reaction_error", {
        messageId: data.messageId,
        error: "Message not found",
      });
      return;
    }

    if (existingMessage.deletedAt) {
      socket.emit("reaction_error", {
        messageId: data.messageId,
        error: "Cannot react to deleted message",
      });
      return;
    }

    const reactionUpdate = await storage.toggleConversationReactionSync(
      data.messageId,
      socket.userId,
      data.emoji,
    );

    if (!reactionUpdate) {
      socket.emit("reaction_error", {
        messageId: data.messageId,
        error: "Failed to update reaction",
      });
      return;
    }

    io.to(`user:${reactionUpdate.senderId}`)
      .to(`user:${reactionUpdate.receiverId}`)
      .emit("message_reactions_updated", reactionUpdate as ReactionSyncPayload);
  } catch (error) {
    console.error("Socket.IO toggle_reaction error:", error);
    socket.emit("reaction_error", {
      messageId: data.messageId,
      error: "Failed to toggle reaction",
    });
  }
}

export async function persistAndDeliverDelete(
  socket: Socket,
  io: SocketIOServer,
  data: DeleteMessagePayload,
): Promise<void> {
  try {
    const existingMessage = await storage.getConversationMessageMeta(
      data.messageId,
      socket.userId,
    );

    if (!existingMessage) {
      socket.emit("delete_error", {
        messageId: data.messageId,
        error: "Message not found",
      });
      return;
    }

    if (existingMessage.senderId !== socket.userId) {
      socket.emit("delete_error", {
        messageId: data.messageId,
        error: "You can only delete your own messages",
      });
      return;
    }

    const deletedMessage = await storage.deleteConversationMessageSync(
      data.messageId,
    );

    if (!deletedMessage) {
      socket.emit("delete_error", {
        messageId: data.messageId,
        error: "Failed to delete message",
      });
      return;
    }

    io.to(`user:${deletedMessage.senderId}`)
      .to(`user:${deletedMessage.receiverId}`)
      .emit("message_deleted", deletedMessage);
  } catch (error) {
    console.error("Socket.IO delete_message error:", error);
    socket.emit("delete_error", {
      messageId: data.messageId,
      error: "Failed to delete message",
    });
  }
}

export async function handleMarkConversationRead(
  socket: Socket,
  io: SocketIOServer,
  data: { otherUserId: number },
): Promise<void> {
  const userId = socket.userId;
  if (!userId || !data?.otherUserId) return;

  await storage.markConversationAsRead(userId, data.otherUserId);
  await emitSidebarUsers(io, [userId]);
}

export async function emitMissedMessagesSummary(socket: Socket): Promise<void> {
  if (!socket.userId) return;

  try {
    const unreadCounts = await storage.getUnreadMessageCountsForUser(
      socket.userId,
    );
    if (unreadCounts.size === 0) return;

    const senderIds = Array.from(unreadCounts.keys());
    const senders = await storage.getUsersByIds(senderIds);

    const conversations = senders.map((sender) => ({
      senderId: sender.userId,
      senderUsername: sender.username,
      unreadCount: unreadCounts.get(sender.userId) ?? 0,
      conversationUrl: `/direct?user=${sender.userId}`,
    }));

    socket.emit("missed_messages_summary", { conversations });
    console.log(
      `[Notification] Emitted missed_messages_summary to user=${socket.userId}: ${conversations.length} conversation(s)`,
    );
  } catch (error) {
    console.error(
      `[Notification] Failed to emit missed_messages_summary for user=${socket.userId}:`,
      error,
    );
  }
}
