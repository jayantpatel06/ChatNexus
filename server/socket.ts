import {
  insertAttachmentSchema,
  insertGlobalMessageSchema,
  insertMessageSchema,
  type MessageReplyPreview,
  type MessageReactionWithUser,
  type User,
} from "@shared/schema";
import type { Server } from "http";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "./lib/jwt";
import { messageRateLimiter } from "./middleware/rate-limit";
import { getConversationId } from "./db/message";
import { sortUsersByPresence } from "./lib/user-utils";
import { storage } from "./storage";

declare module "socket.io" {
  interface Socket {
    userId: number;
  }
}

interface PrivateMessagePayload {
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

interface GlobalMessagePayload {
  message: string;
}

interface RandomChatRequestPayload {
  interests?: unknown;
  interestsMatchingEnabled?: unknown;
}

interface RandomChatMessagePayload {
  message?: string;
}

interface TypingPayload {
  receiverId: number;
}

interface ReactionPayload {
  messageId: number;
  emoji: string;
}

interface DeleteMessagePayload {
  messageId: number;
}

interface ReactionSyncPayload {
  messageId: number;
  senderId: number;
  receiverId: number;
  reactions: MessageReactionWithUser[];
}

type RandomChatPreferences = {
  interests: string[];
  interestsMatchingEnabled: boolean;
};

type RandomChatQueueEntry = RandomChatPreferences & {
  queuedAt: number;
  userId: number;
};

type RandomChatSession = {
  startedAt: number;
  userAId: number;
  userBId: number;
};

const SOCKET_CONFIG = {
  PRESENCE_BROADCAST_DELAY_MS: 200,
  OFFLINE_GRACE_PERIOD_MS: 2000,
  GUEST_DELETION_GRACE_PERIOD_MS: 24 * 60 * 60 * 1000,
  CLEANUP_INTERVAL_MS: 30 * 1000,
  GLOBAL_CHAT_MAX_AGE_MS: 30 * 60 * 1000,
  EPHEMERAL_CHAT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  ATTACHMENT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
};

const privateMessageAttachmentSchema = insertAttachmentSchema.omit({
  messageId: true,
});

const guestDisconnectionTimes = new Map<number, number>();
const pendingOfflineUpdates = new Map<number, NodeJS.Timeout>();
const connectedSocketIdsByUser = new Map<number, Set<string>>();
const randomChatActiveUsers = new Set<number>();
const randomChatPreferencesByUser = new Map<number, RandomChatPreferences>();
const randomChatQueueByUser = new Map<number, RandomChatQueueEntry>();
const randomChatSessionsByUser = new Map<number, RandomChatSession>();
let lastGlobalChatCleanupAt = 0;
let pendingGlobalChatCleanup: Promise<void> | null = null;
let pendingRandomChatMatchProcessing: Promise<void> | null = null;
let rerunRandomChatMatchProcessing = false;

function sanitizeRandomChatPreferences(
  payload?: RandomChatRequestPayload | null,
): RandomChatPreferences {
  const resolvedPayload = payload ?? {};
  const rawInterests = Array.isArray(resolvedPayload.interests)
    ? resolvedPayload.interests
    : [];
  const interests = Array.from(
    new Set(
      rawInterests
        .map((interest) =>
          typeof interest === "string" ? interest.trim().slice(0, 24) : "",
        )
        .filter(Boolean),
    ),
  ).slice(0, 10);

  return {
    interests,
    interestsMatchingEnabled: resolvedPayload.interestsMatchingEnabled !== false,
  };
}

function getRandomChatPartnerId(userId: number): number | null {
  const session = randomChatSessionsByUser.get(userId);
  if (!session) {
    return null;
  }

  return session.userAId === userId ? session.userBId : session.userAId;
}

function getRandomChatSharedInterests(
  left: RandomChatPreferences,
  right: RandomChatPreferences,
): string[] {
  const rightInterests = new Set(
    right.interests.map((interest) => interest.toLowerCase()),
  );

  return left.interests.filter((interest) =>
    rightInterests.has(interest.toLowerCase()),
  );
}

function queueRandomChatUser(
  userId: number,
  preferences?: RandomChatPreferences,
): RandomChatQueueEntry {
  const resolvedPreferences =
    preferences ??
    randomChatPreferencesByUser.get(userId) ?? {
      interests: [],
      interestsMatchingEnabled: true,
    };

  randomChatPreferencesByUser.set(userId, resolvedPreferences);

  const queueEntry: RandomChatQueueEntry = {
    userId,
    queuedAt: Date.now(),
    ...resolvedPreferences,
  };

  randomChatQueueByUser.set(userId, queueEntry);
  randomChatActiveUsers.add(userId);

  return queueEntry;
}

function removeRandomChatSession(userId: number): number | null {
  const partnerId = getRandomChatPartnerId(userId);
  if (partnerId === null) {
    return null;
  }

  randomChatSessionsByUser.delete(userId);
  randomChatSessionsByUser.delete(partnerId);

  return partnerId;
}

function emitRandomChatSearching(
  io: SocketIOServer,
  userId: number,
  message = "Looking for a new conversation...",
) {
  io.to(`user:${userId}`).emit("random_chat_searching", { message });
}

function getSocketCorsOrigin() {
  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:5173", "http://localhost:5000"];
  }

  const configuredOrigins = (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) {
    throw new Error("FRONTEND_URL must be set in production for Socket.IO CORS");
  }

  return configuredOrigins.length === 1 ? configuredOrigins[0] : configuredOrigins;
}

function addConnectedSocket(userId: number, socketId: string): boolean {
  const existingSocketIds = connectedSocketIdsByUser.get(userId);
  const socketIds = existingSocketIds ?? new Set<string>();
  const wasOnline = socketIds.size > 0;

  socketIds.add(socketId);
  connectedSocketIdsByUser.set(userId, socketIds);

  return !wasOnline;
}

function removeConnectedSocket(userId: number, socketId: string): boolean {
  const socketIds = connectedSocketIdsByUser.get(userId);
  if (!socketIds) {
    return false;
  }

  socketIds.delete(socketId);

  if (socketIds.size === 0) {
    connectedSocketIdsByUser.delete(userId);
    return true;
  }

  return false;
}

function hasActiveSocketForUser(userId: number): boolean {
  return (connectedSocketIdsByUser.get(userId)?.size ?? 0) > 0;
}

function getConnectedUserIds(): Set<number> {
  return new Set(connectedSocketIdsByUser.keys());
}

export async function getSidebarUsersForUser(userId: number): Promise<User[]> {
  const connectedUserIds = getConnectedUserIds();
  const [friendUsers, connectedUsers, restrictedUserIds] = await Promise.all([
    storage.getFriendUsers(userId),
    storage.getUsersByIds(Array.from(connectedUserIds)),
    storage.getRestrictedUserIds(userId),
  ]);

  const sidebarUsers = new Map<number, User>();

  for (const connectedUser of connectedUsers) {
    if (
      connectedUser.userId !== userId &&
      !restrictedUserIds.includes(connectedUser.userId)
    ) {
      sidebarUsers.set(connectedUser.userId, {
        ...connectedUser,
        isOnline: true,
      });
    }
  }

  for (const friendUser of friendUsers) {
    if (
      friendUser.userId !== userId &&
      !restrictedUserIds.includes(friendUser.userId)
    ) {
      sidebarUsers.set(friendUser.userId, {
        ...friendUser,
        isOnline: connectedUserIds.has(friendUser.userId),
      });
    }
  }

  return sortUsersByPresence(Array.from(sidebarUsers.values()));
}

export async function emitSidebarUsers(
  io: SocketIOServer,
  targetUserIds?: Iterable<number>,
): Promise<void> {
  const recipientIds =
    targetUserIds === undefined
      ? Array.from(getConnectedUserIds())
      : Array.from(new Set(Array.from(targetUserIds)));

  await Promise.all(
    recipientIds.map(async (userId) => {
      const users = await getSidebarUsersForUser(userId);
      io.to(`user:${userId}`).emit("online_users_updated", { users });
    }),
  );
}

async function findBestRandomChatCandidate(
  userId: number,
): Promise<{ otherUserId: number; sharedInterests: string[] } | null> {
  const sourceEntry = randomChatQueueByUser.get(userId);
  if (!sourceEntry) {
    return null;
  }

  const restrictedUserIds = new Set(await storage.getRestrictedUserIds(userId));

  let bestCandidate:
    | {
        otherUserId: number;
        queuedAt: number;
        score: number;
        sharedInterests: string[];
      }
    | null = null;

  for (const [otherUserId, otherEntry] of randomChatQueueByUser.entries()) {
    if (otherUserId === userId) {
      continue;
    }

    if (
      randomChatSessionsByUser.has(otherUserId) ||
      !randomChatActiveUsers.has(otherUserId) ||
      !hasActiveSocketForUser(otherUserId) ||
      restrictedUserIds.has(otherUserId)
    ) {
      continue;
    }

    const sharedInterests = getRandomChatSharedInterests(sourceEntry, otherEntry);
    const score =
      (sourceEntry.interestsMatchingEnabled ||
      otherEntry.interestsMatchingEnabled
        ? sharedInterests.length
        : 0) * 1000 -
      otherEntry.queuedAt;

    if (
      !bestCandidate ||
      score > bestCandidate.score ||
      (score === bestCandidate.score && otherEntry.queuedAt < bestCandidate.queuedAt)
    ) {
      bestCandidate = {
        otherUserId,
        queuedAt: otherEntry.queuedAt,
        score,
        sharedInterests,
      };
    }
  }

  if (!bestCandidate) {
    return null;
  }

  return {
    otherUserId: bestCandidate.otherUserId,
    sharedInterests: bestCandidate.sharedInterests,
  };
}

async function createRandomChatSession(
  io: SocketIOServer,
  userAId: number,
  userBId: number,
  sharedInterests: string[],
): Promise<void> {
  const users = await storage.getUsersByIds([userAId, userBId]);
  const userMap = new Map(users.map((user) => [user.userId, user]));
  const userA = userMap.get(userAId);
  const userB = userMap.get(userBId);

  if (!userA || !userB) {
    randomChatQueueByUser.delete(userAId);
    randomChatQueueByUser.delete(userBId);
    return;
  }

  if (!hasActiveSocketForUser(userAId) || !hasActiveSocketForUser(userBId)) {
    if (!hasActiveSocketForUser(userAId)) {
      randomChatQueueByUser.delete(userAId);
      randomChatActiveUsers.delete(userAId);
    }

    if (!hasActiveSocketForUser(userBId)) {
      randomChatQueueByUser.delete(userBId);
      randomChatActiveUsers.delete(userBId);
    }

    return;
  }

  randomChatQueueByUser.delete(userAId);
  randomChatQueueByUser.delete(userBId);

  const session: RandomChatSession = {
    userAId,
    userBId,
    startedAt: Date.now(),
  };

  randomChatSessionsByUser.set(userAId, session);
  randomChatSessionsByUser.set(userBId, session);

  io.to(`user:${userAId}`).emit("random_chat_matched", {
    partner: userB,
    sharedInterests,
  });
  io.to(`user:${userBId}`).emit("random_chat_matched", {
    partner: userA,
    sharedInterests,
  });
}

async function processRandomChatQueue(io: SocketIOServer): Promise<void> {
  if (pendingRandomChatMatchProcessing) {
    rerunRandomChatMatchProcessing = true;
    return pendingRandomChatMatchProcessing;
  }

  pendingRandomChatMatchProcessing = (async () => {
    do {
      rerunRandomChatMatchProcessing = false;

      for (const userId of Array.from(randomChatQueueByUser.keys())) {
        if (
          !randomChatQueueByUser.has(userId) ||
          randomChatSessionsByUser.has(userId) ||
          !randomChatActiveUsers.has(userId) ||
          !hasActiveSocketForUser(userId)
        ) {
          continue;
        }

        const candidate = await findBestRandomChatCandidate(userId);
        if (!candidate) {
          continue;
        }

        if (
          !randomChatQueueByUser.has(userId) ||
          !randomChatQueueByUser.has(candidate.otherUserId)
        ) {
          continue;
        }

        await createRandomChatSession(
          io,
          userId,
          candidate.otherUserId,
          candidate.sharedInterests,
        );
      }
    } while (rerunRandomChatMatchProcessing);
  })()
    .catch((error) => {
      console.error("Random chat matchmaking failed:", error);
    })
    .finally(() => {
      pendingRandomChatMatchProcessing = null;
    });

  return pendingRandomChatMatchProcessing;
}

async function endRandomChatForUser(
  io: SocketIOServer,
  userId: number,
  options?: {
    notifyPartner?: boolean;
    partnerMessage?: string;
    requeuePartner?: boolean;
  },
): Promise<void> {
  const partnerId = removeRandomChatSession(userId);
  if (partnerId === null) {
    return;
  }

  const shouldRequeuePartner =
    options?.requeuePartner === true &&
    randomChatActiveUsers.has(partnerId) &&
    hasActiveSocketForUser(partnerId);

  if (options?.notifyPartner !== false) {
    io.to(`user:${partnerId}`).emit("random_chat_session_ended", {
      message:
        options?.partnerMessage ??
        (shouldRequeuePartner
          ? "The user has skipped the chat. Looking for a new conversation..."
          : "The user has skipped the chat."),
      requeued: shouldRequeuePartner,
    });
  }

  if (shouldRequeuePartner) {
    queueRandomChatUser(partnerId);
    emitRandomChatSearching(
      io,
      partnerId,
      options?.partnerMessage ??
        "The user has skipped the chat. Looking for a new conversation...",
    );
    await processRandomChatQueue(io);
  }
}

function createPresenceBroadcaster(io: SocketIOServer) {
  let presenceBroadcastScheduled = false;
  const pendingUserIds = new Set<number>();

  return async (changedUserId?: number) => {
    if (changedUserId) {
      pendingUserIds.add(changedUserId);
    }

    if (presenceBroadcastScheduled) return;
    presenceBroadcastScheduled = true;

    setTimeout(async () => {
      try {
        presenceBroadcastScheduled = false;
        const userIds = pendingUserIds.size > 0 ? new Set(pendingUserIds) : undefined;
        pendingUserIds.clear();

        if (userIds) {
          // Get friends & conversation partners of the changed users
          const affectedUserIds = new Set<number>(userIds);
          for (const userId of userIds) {
            const [friends, partners] = await Promise.all([
              storage.getFriendUsers(userId),
              storage.getConversationUsers(userId),
            ]);
            for (const f of friends) affectedUserIds.add(f.userId);
            for (const p of partners) affectedUserIds.add(p.userId);
          }

          // Only emit to affected connected users
          const connectedIds = getConnectedUserIds();
          const targetIds = Array.from(affectedUserIds).filter((id) =>
            connectedIds.has(id),
          );
          await emitSidebarUsers(io, targetIds);
        } else {
          await emitSidebarUsers(io);
        }
      } catch (error) {
        console.error("Failed to broadcast sidebar users:", error);
      }
    }, SOCKET_CONFIG.PRESENCE_BROADCAST_DELAY_MS);
  };
}

async function cleanupExpiredEphemeralMessages(now: number): Promise<number> {
  const maxAge = new Date(now - SOCKET_CONFIG.EPHEMERAL_CHAT_MAX_AGE_MS);
  return storage.cleanupExpiredEphemeralMessages(maxAge);
}

export async function cleanupExpiredGlobalMessagesIfNeeded(
  io: SocketIOServer,
): Promise<void> {
  const now = Date.now();

  if (
    lastGlobalChatCleanupAt > 0 &&
    now - lastGlobalChatCleanupAt < SOCKET_CONFIG.GLOBAL_CHAT_MAX_AGE_MS
  ) {
    return;
  }

  if (pendingGlobalChatCleanup) {
    await pendingGlobalChatCleanup;
    return;
  }

  pendingGlobalChatCleanup = (async () => {
    try {
      const expiredBefore = new Date(
        Date.now() - SOCKET_CONFIG.GLOBAL_CHAT_MAX_AGE_MS,
      );
      const deletedMessageIds =
        await storage.cleanupExpiredGlobalMessages(expiredBefore);

      lastGlobalChatCleanupAt = Date.now();

      if (deletedMessageIds.length > 0) {
        io.emit("global_messages_deleted", {
          messageIds: deletedMessageIds,
        });
      }
    } catch (error) {
      console.error("Error cleaning up expired global messages:", error);
    } finally {
      pendingGlobalChatCleanup = null;
    }
  })();

  await pendingGlobalChatCleanup;
}

async function cleanupGuestUsers(
  now: number,
  connectedUserIds: Set<number>,
): Promise<number> {
  let deletedUsers = 0;

  for (const [userId, disconnectionTime] of guestDisconnectionTimes.entries()) {
    const gracePeriodExpired =
      now - disconnectionTime > SOCKET_CONFIG.GUEST_DELETION_GRACE_PERIOD_MS;
    const userStillDisconnected = !connectedUserIds.has(userId);

    if (gracePeriodExpired && userStillDisconnected) {
      try {
        const user = await storage.getUser(userId);
        if (user?.isGuest) {
          await storage.deleteUser(userId);
          randomChatActiveUsers.delete(userId);
          randomChatPreferencesByUser.delete(userId);
          randomChatQueueByUser.delete(userId);
          randomChatSessionsByUser.delete(userId);
          deletedUsers += 1;
          console.log(`Deleted disconnected guest user: ${user.username} (ID: ${userId})`);
        }
      } catch (error) {
        console.error(`Failed to delete disconnected guest user ${userId}:`, error);
      }

      guestDisconnectionTimes.delete(userId);
    }
  }

  return deletedUsers;
}

async function cleanupOfflineUsers(connectedUserIds: Set<number>): Promise<void> {
  const onlineUsers = await storage.getOnlineUsers();

  for (const user of onlineUsers) {
    if (!connectedUserIds.has(user.userId)) {
      await storage.updateUserOnlineStatus(user.userId, false);
    }
  }
}

function startPeriodicCleanup(
  io: SocketIOServer,
  broadcastOnlineUsers: (changedUserId?: number) => Promise<void>,
): void {
  setInterval(async () => {
    try {
      const now = Date.now();

      const deletedExpiredMessages = await cleanupExpiredEphemeralMessages(now);

      const connectedUserIds = getConnectedUserIds();

      const deletedUsers = await cleanupGuestUsers(now, connectedUserIds);
      await cleanupOfflineUsers(connectedUserIds);

      if (deletedUsers > 0 || deletedExpiredMessages > 0) {
        await broadcastOnlineUsers();
      }
    } catch (error) {
      console.error("Error during periodic cleanup:", error);
    }
  }, SOCKET_CONFIG.CLEANUP_INTERVAL_MS);
}

async function handlePrivateMessage(
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

// Background persistence and delivery - fast path without temp messages
async function persistAndDeliverMessage(
  socket: Socket,
  io: SocketIOServer,
  data: PrivateMessagePayload,
  clientMessageId: string | undefined,
): Promise<void> {
  try {
    // Check block status
    const relationshipBlock = await storage.getBlockBetweenUsers(
      socket.userId,
      data.receiverId,
    );
    if (relationshipBlock) {
      const errorMsg = relationshipBlock.blockerId === socket.userId
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
  } catch (error) {
    console.error("Message persistence/delivery error:", error);
    socket.emit("message_save_error", {
      clientMessageId,
      error: "Failed to save message",
    });
  }
}

async function handleGlobalMessage(
  socket: Socket,
  io: SocketIOServer,
  data: GlobalMessagePayload,
): Promise<void> {
  try {
    if (!socket.userId || !data.message) {
      return;
    }

    await cleanupExpiredGlobalMessagesIfNeeded(io);

    const validatedMessage = insertGlobalMessageSchema.parse({
      senderId: socket.userId,
      message: data.message,
    });

    const savedMessage = await storage.createGlobalMessage(validatedMessage);
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Socket] Created global message: ${savedMessage.id} from user ${socket.userId}`,
      );
    }

    io.emit("global_message", { message: savedMessage });
  } catch (error) {
    console.error("Socket.IO global_message error:", error);
  }
}

async function handleRandomChatRequestMatch(
  socket: Socket,
  io: SocketIOServer,
  payload: RandomChatRequestPayload,
): Promise<void> {
  if (!socket.userId) {
    return;
  }

  const preferences = sanitizeRandomChatPreferences(payload);
  randomChatPreferencesByUser.set(socket.userId, preferences);
  randomChatActiveUsers.add(socket.userId);
  randomChatQueueByUser.delete(socket.userId);

  await endRandomChatForUser(io, socket.userId, {
    partnerMessage: "The user has skipped the chat.",
  });

  queueRandomChatUser(socket.userId, preferences);
  emitRandomChatSearching(io, socket.userId);
  await processRandomChatQueue(io);
}

async function handleRandomChatUpdatePreferences(
  socket: Socket,
  io: SocketIOServer,
  payload: RandomChatRequestPayload,
): Promise<void> {
  if (!socket.userId) {
    return;
  }

  const preferences = sanitizeRandomChatPreferences(payload);
  randomChatPreferencesByUser.set(socket.userId, preferences);

  if (randomChatQueueByUser.has(socket.userId)) {
    queueRandomChatUser(socket.userId, preferences);
    emitRandomChatSearching(io, socket.userId);
    await processRandomChatQueue(io);
  }
}

async function handleRandomChatLeave(
  socket: Socket,
  io: SocketIOServer,
): Promise<void> {
  if (!socket.userId) {
    return;
  }

  randomChatActiveUsers.delete(socket.userId);
  randomChatQueueByUser.delete(socket.userId);
  await endRandomChatForUser(io, socket.userId, {
    partnerMessage: "The user has skipped the chat.",
  });
}

function handleRandomChatMessage(
  socket: Socket,
  io: SocketIOServer,
  payload?: RandomChatMessagePayload | null,
): void {
  if (!socket.userId) {
    return;
  }

  const rateLimit = messageRateLimiter.consume(`random:${socket.userId}`);
  if (!rateLimit.allowed) {
    socket.emit("random_chat_error", {
      message: messageRateLimiter.message,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    return;
  }

  const partnerId = getRandomChatPartnerId(socket.userId);
  if (partnerId === null) {
    socket.emit("random_chat_error", {
      message: "You are not currently matched with anyone.",
    });
    return;
  }

  const message =
    typeof payload?.message === "string"
      ? payload.message.trim().slice(0, 2000)
      : "";
  if (!message) {
    socket.emit("random_chat_error", {
      message: "Message cannot be empty.",
    });
    return;
  }

  const eventPayload = {
    message: {
      id: `r-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      senderId: socket.userId,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  io.to(`user:${socket.userId}`)
    .to(`user:${partnerId}`)
    .emit("random_chat_message", eventPayload);
}

function handleRandomChatTyping(
  socket: Socket,
  io: SocketIOServer,
  isTyping: boolean,
): void {
  if (!socket.userId) {
    return;
  }

  const partnerId = getRandomChatPartnerId(socket.userId);
  if (partnerId === null) {
    return;
  }

  io.to(`user:${partnerId}`).emit("random_chat_typing", {
    isTyping,
    userId: socket.userId,
  });
}

function handleTypingStart(
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

function handleTypingStop(
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

// Fast reaction toggle via socket
function handleToggleReaction(
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

  void persistAndDeliverReaction(socket, io, data);
}

// Fast message deletion via socket - completely removes from UI
function handleDeleteMessage(
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

async function persistAndDeliverReaction(
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

async function persistAndDeliverDelete(
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

async function handleMarkConversationRead(
  socket: Socket,
  io: SocketIOServer,
  data: { otherUserId: number },
): Promise<void> {
  const userId = socket.userId;
  if (!userId || !data?.otherUserId) return;

  await storage.markConversationAsRead(userId, data.otherUserId);
  emitSidebarUsers(io, [userId]);
}

async function handleDisconnect(
  socket: Socket,
  io: SocketIOServer,
  broadcastOnlineUsers: (changedUserId?: number) => Promise<void>,
): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.log("Socket.IO client disconnected");
  }

  if (!socket.userId) return;

  const userId = socket.userId;
  const becameOffline = removeConnectedSocket(userId, socket.id);

  if (!becameOffline) {
    return;
  }

  await handleRandomChatLeave(socket, io);

  const existingPendingOffline = pendingOfflineUpdates.get(userId);
  if (existingPendingOffline) {
    clearTimeout(existingPendingOffline);
  }

  const offlineTimeout = setTimeout(async () => {
    pendingOfflineUpdates.delete(userId);

    if (hasActiveSocketForUser(userId)) {
      return;
    }

    randomChatPreferencesByUser.delete(userId);

    const user = await storage.getUser(userId);

    if (user) {
      await storage.updateUserOnlineStatus(userId, false);

      if (user.isGuest) {
        guestDisconnectionTimes.set(userId, Date.now());
        if (process.env.NODE_ENV === "development") {
          console.log(
            `Guest user ${user.username} (ID: ${userId}) disconnected, starting grace period`,
          );
        }
      }
    } else if (process.env.NODE_ENV === "development") {
      console.log(`User ${userId} no longer exists in database`);
    }

    await broadcastOnlineUsers(userId);
  }, SOCKET_CONFIG.OFFLINE_GRACE_PERIOD_MS);

  pendingOfflineUpdates.set(userId, offlineTimeout);
}

export function createSocketServer(httpServer: Server) {
  return new IOServer(httpServer, {
    cors: {
      origin: getSocketCorsOrigin(),
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 1e7,
  });
}

export function setupSocketAuth(io: SocketIOServer): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required: No token provided"));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error("Authentication required: Invalid or expired token"));
    }

    socket.userId = decoded.userId;
    next();
  });
}

export function setupSocketHandlers(io: SocketIOServer): void {
  const broadcastOnlineUsers = createPresenceBroadcaster(io);

  io.on("connection", async (socket) => {
    if (process.env.NODE_ENV === "development") {
      console.log("Socket.IO connection established");
    }

    if (socket.userId) {
      const becameOnline = addConnectedSocket(socket.userId, socket.id);
      const pendingOffline = pendingOfflineUpdates.get(socket.userId);
      if (pendingOffline) {
        clearTimeout(pendingOffline);
        pendingOfflineUpdates.delete(socket.userId);
        if (process.env.NODE_ENV === "development") {
          console.log(
            `Cleared pending offline update for user ${socket.userId} (reconnected)`,
          );
        }
      }

      if (becameOnline) {
        await storage.updateUserOnlineStatus(socket.userId, true);
      }
      socket.join(`user:${socket.userId}`);
      guestDisconnectionTimes.delete(socket.userId);
      await broadcastOnlineUsers(socket.userId);
    }

    socket.on("private_message", async (data: PrivateMessagePayload) => {
      const rateLimit = messageRateLimiter.consume(String(socket.userId));
      if (!rateLimit.allowed) {
        socket.emit("message_save_error", {
          clientMessageId: data?.clientMessageId,
          error: messageRateLimiter.message,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return;
      }

      await handlePrivateMessage(socket, io, data);
    });

    socket.on("global_message", async (data: GlobalMessagePayload) => {
      const rateLimit = messageRateLimiter.consume(String(socket.userId));
      if (!rateLimit.allowed) {
        socket.emit("global_message_error", {
          error: messageRateLimiter.message,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return;
      }

      await handleGlobalMessage(socket, io, data);
    });

    socket.on("random_chat_request_match", async (data: RandomChatRequestPayload) => {
      await handleRandomChatRequestMatch(socket, io, data);
    });

    socket.on(
      "random_chat_update_preferences",
      async (data: RandomChatRequestPayload) => {
        await handleRandomChatUpdatePreferences(socket, io, data);
      },
    );

    socket.on("random_chat_leave", async () => {
      await handleRandomChatLeave(socket, io);
    });

    socket.on("random_chat_send_message", (data: RandomChatMessagePayload) => {
      handleRandomChatMessage(socket, io, data);
    });

    socket.on("random_chat_typing_start", () => {
      handleRandomChatTyping(socket, io, true);
    });

    socket.on("random_chat_typing_stop", () => {
      handleRandomChatTyping(socket, io, false);
    });

    socket.on("typing_start", (data: TypingPayload) => {
      handleTypingStart(socket, io, data);
    });

    socket.on("typing_stop", (data: TypingPayload) => {
      handleTypingStop(socket, io, data);
    });

    socket.on("toggle_reaction", async (data: ReactionPayload) => {
      await handleToggleReaction(socket, io, data);
    });

    socket.on("delete_message", async (data: DeleteMessagePayload) => {
      await handleDeleteMessage(socket, io, data);
    });

    socket.on("mark_conversation_read", async (data: { otherUserId: number }) => {
      await handleMarkConversationRead(socket, io, data);
    });

    socket.on("disconnect", async () => {
      await handleDisconnect(socket, io, broadcastOnlineUsers);
    });
  });

  startPeriodicCleanup(io, broadcastOnlineUsers);
}
