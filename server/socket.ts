import {
  insertAttachmentSchema,
  insertGlobalMessageSchema,
  insertMessageSchema,
} from "@shared/schema";
import type { Server } from "http";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "./lib/jwt";
import { messageRateLimiter } from "./middleware/rate-limit";
import { getConversationId } from "./data/repositories/message.repository";
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
  EPHEMERAL_CHAT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  ATTACHMENT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
};

const guestDisconnectionTimes = new Map<number, number>();
const pendingOfflineUpdates = new Map<number, NodeJS.Timeout>();

function createPresenceBroadcaster(io: SocketIOServer) {
  let presenceBroadcastScheduled = false;

  return async () => {
    if (presenceBroadcastScheduled) return;
    presenceBroadcastScheduled = true;

    setTimeout(async () => {
      presenceBroadcastScheduled = false;
      const onlineUsers = await storage.getOnlineUsers();
      io.emit("online_users_updated", { users: onlineUsers });
    }, SOCKET_CONFIG.PRESENCE_BROADCAST_DELAY_MS);
  };
}

async function cleanupExpiredEphemeralMessages(now: number): Promise<number> {
  const maxAge = new Date(now - SOCKET_CONFIG.EPHEMERAL_CHAT_MAX_AGE_MS);
  return storage.cleanupExpiredEphemeralMessages(maxAge);
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

      const connectedUserIds = new Set<number>();
      io.sockets.sockets.forEach((socket) => {
        if (socket.userId) {
          connectedUserIds.add(socket.userId);
        }
      });

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
  try {
    if (!socket.userId || !data.receiverId || (!data.message && !data.attachment)) {
      return;
    }

    if (!data.message && !data.attachment?.url) {
      return;
    }

    const conversationId = getConversationId(socket.userId, data.receiverId);

    const tempMessage = {
      msgId: Date.now(),
      senderId: socket.userId,
      receiverId: data.receiverId,
      conversationId,
      message: data.message || "Sent an attachment",
      timestamp: new Date(),
      attachments: data.attachment?.url
        ? [
            {
              id: Date.now(),
              url: data.attachment.url,
              filename: data.attachment.filename,
              fileType: data.attachment.fileType,
            },
          ]
        : [],
    };

    io.to(`user:${data.receiverId}`).emit("new_message", { message: tempMessage });

    socket.emit("message_sent", {
      message: tempMessage,
      clientMessageId: data.clientMessageId,
    });

    const senderId = socket.userId;
    const receiverId = data.receiverId;
    const messageText = data.message;
    const attachment = data.attachment;
    const clientMessageId = data.clientMessageId;

    process.nextTick(async () => {
      try {
        const validatedMessage = insertMessageSchema.parse({
          senderId,
          receiverId,
          conversationId,
          message: messageText || "Sent an attachment",
        });

        const savedMessage = await storage.createMessage(validatedMessage);

        if (attachment) {
          const attachmentData = insertAttachmentSchema.parse({
            messageId: savedMessage.msgId,
            url: attachment.url,
            filename: attachment.filename,
            fileType: attachment.fileType,
          });
          await storage.createAttachment(attachmentData);
        }
      } catch (dbError) {
        console.error("Error saving message to database:", dbError);
        socket.emit("message_save_error", {
          clientMessageId,
          error: "Failed to persist message",
        });
      }
    });
  } catch (error) {
    console.error("Socket.IO private_message error:", error);
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
  broadcastOnlineUsers: () => Promise<void>,
): Promise<void> {
  console.log("Socket.IO client disconnected");

  if (!socket.userId) return;

  const userId = socket.userId;

  const offlineTimeout = setTimeout(async () => {
    pendingOfflineUpdates.delete(userId);

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
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.FRONTEND_URL || true
          : ["http://localhost:5173", "http://localhost:5000"],
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
      const pendingOffline = pendingOfflineUpdates.get(socket.userId);
      if (pendingOffline) {
        clearTimeout(pendingOffline);
        pendingOfflineUpdates.delete(socket.userId);
        console.log(
          `Cleared pending offline update for user ${socket.userId} (reconnected)`,
        );
      }

      await storage.updateUserOnlineStatus(socket.userId, true);
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
      await handleDisconnect(socket, broadcastOnlineUsers);
    });
  });

  startPeriodicCleanup(io, broadcastOnlineUsers);
}
