import {
  insertAttachmentSchema,
  insertGlobalMessageSchema,
  insertMessageSchema,
  type User,
} from "@shared/schema";
import type { Server } from "http";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "./lib/jwt";
import { messageRateLimiter } from "./middleware/rate-limit";
import { getConversationId } from "./db/message";
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
  attachment?: {
    url: string;
    filename: string;
    fileType: string;
  };
}

interface GlobalMessagePayload {
  message: string;
}

interface TypingPayload {
  receiverId: number;
}

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
let lastGlobalChatCleanupAt = 0;
let pendingGlobalChatCleanup: Promise<void> | null = null;

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
  const [friendUsers, connectedUsers] = await Promise.all([
    storage.getFriendUsers(userId),
    storage.getUsersByIds(Array.from(connectedUserIds)),
  ]);

  const sidebarUsers = new Map<number, User>();

  for (const connectedUser of connectedUsers) {
    if (connectedUser.userId !== userId) {
      sidebarUsers.set(connectedUser.userId, {
        ...connectedUser,
        isOnline: true,
      });
    }
  }

  for (const friendUser of friendUsers) {
    if (friendUser.userId !== userId) {
      sidebarUsers.set(friendUser.userId, {
        ...friendUser,
        isOnline: connectedUserIds.has(friendUser.userId),
      });
    }
  }

  return Array.from(sidebarUsers.values()).sort(
    (left, right) =>
      Number(right.isOnline) - Number(left.isOnline) ||
      left.username.localeCompare(right.username),
  );
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

function createPresenceBroadcaster(io: SocketIOServer) {
  let presenceBroadcastScheduled = false;

  return async () => {
    if (presenceBroadcastScheduled) return;
    presenceBroadcastScheduled = true;

    setTimeout(async () => {
      try {
        presenceBroadcastScheduled = false;
        await emitSidebarUsers(io);
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
      const user = await storage.getUser(userId);
      if (user?.isGuest) {
        await storage.deleteUser(userId);
        deletedUsers += 1;
        console.log(`Deleted disconnected guest user: ${user.username} (ID: ${userId})`);
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
  broadcastOnlineUsers: () => Promise<void>,
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

    const conversationId = getConversationId(socket.userId, data.receiverId);

    const validatedMessage = insertMessageSchema.parse({
      senderId: socket.userId,
      receiverId: data.receiverId,
      conversationId,
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
    );

    io.to(`user:${data.receiverId}`).emit("new_message", {
      message: persistedMessage,
    });

    socket.emit("message_sent", {
      message: persistedMessage,
      clientMessageId,
    });
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
    console.log(
      `[Socket] Created global message: ${savedMessage.id} from user ${socket.userId}`,
    );

    io.emit("global_message", { message: savedMessage });
  } catch (error) {
    console.error("Socket.IO global_message error:", error);
  }
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

async function handleDisconnect(
  socket: Socket,
  io: SocketIOServer,
  broadcastOnlineUsers: () => Promise<void>,
): Promise<void> {
  console.log("Socket.IO client disconnected");

  if (!socket.userId) return;

  const userId = socket.userId;
  removeConnectedSocket(userId, socket.id);

  const existingPendingOffline = pendingOfflineUpdates.get(userId);
  if (existingPendingOffline) {
    clearTimeout(existingPendingOffline);
  }

  const offlineTimeout = setTimeout(async () => {
    pendingOfflineUpdates.delete(userId);

    if (hasActiveSocketForUser(userId)) {
      return;
    }

    const user = await storage.getUser(userId);

    if (user) {
      await storage.updateUserOnlineStatus(userId, false);

      if (user.isGuest) {
        guestDisconnectionTimes.set(userId, Date.now());
        console.log(
          `Guest user ${user.username} (ID: ${userId}) disconnected, starting grace period`,
        );
      }
    } else {
      console.log(`User ${userId} no longer exists in database`);
    }

    await broadcastOnlineUsers();
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
    console.log("Socket.IO connection established");

    if (socket.userId) {
      const becameOnline = addConnectedSocket(socket.userId, socket.id);
      const pendingOffline = pendingOfflineUpdates.get(socket.userId);
      if (pendingOffline) {
        clearTimeout(pendingOffline);
        pendingOfflineUpdates.delete(socket.userId);
        console.log(
          `Cleared pending offline update for user ${socket.userId} (reconnected)`,
        );
      }

      if (becameOnline) {
        await storage.updateUserOnlineStatus(socket.userId, true);
      }
      socket.join(`user:${socket.userId}`);
      guestDisconnectionTimes.delete(socket.userId);
      await broadcastOnlineUsers();
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

    socket.on("typing_start", (data: TypingPayload) => {
      handleTypingStart(socket, io, data);
    });

    socket.on("typing_stop", (data: TypingPayload) => {
      handleTypingStop(socket, io, data);
    });

    socket.on("disconnect", async () => {
      await handleDisconnect(socket, io, broadcastOnlineUsers);
    });
  });

  startPeriodicCleanup(io, broadcastOnlineUsers);
}
