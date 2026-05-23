import type { Server } from "http";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "../lib/jwt";
import { messageRateLimiter } from "../middleware/rate-limit";
import { storage } from "../storage";
import { handleUserReconnect } from "../lib/notification-service";

import {
  PrivateMessagePayload,
  GlobalMessagePayload,
  RandomChatRequestPayload,
  RandomChatMessagePayload,
  TypingPayload,
  ReactionPayload,
  DeleteMessagePayload,
  SOCKET_CONFIG,
} from "./types";

import {
  addConnectedSocket,
  removeConnectedSocket,
  hasActiveSocketForUser,
  guestDisconnectionTimes,
  pendingOfflineUpdates,
  hiddenSocketIds,
  createPresenceBroadcaster,
  emitSidebarUsers,
  getSidebarUsersForUser,
} from "./connection";

import {
  handlePrivateMessage,
  handleTypingStart,
  handleTypingStop,
  handleToggleReaction,
  handleDeleteMessage,
  emitMissedMessagesSummary,
  handleMarkConversationRead,
} from "./private-chat";

import {
  handleGlobalMessage,
  cleanupExpiredGlobalMessagesIfNeeded,
} from "./global-chat";

import {
  handleRandomChatRequestMatch,
  handleRandomChatUpdatePreferences,
  handleRandomChatLeave,
  handleRandomChatMessage,
  handleRandomChatTyping,
  randomChatPreferencesByUser,
} from "./random-chat";

import { startPeriodicCleanup } from "./cleanup";

// Extend Socket interface globally
declare module "socket.io" {
  interface Socket {
    userId: number;
  }
}

// Re-export public API symbols
export {
  getSidebarUsersForUser,
  emitSidebarUsers,
  cleanupExpiredGlobalMessagesIfNeeded,
};

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

      // Clear pending notifications for reconnected user and send missed messages summary
      void handleUserReconnect(socket.userId);
      void emitMissedMessagesSummary(socket);
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

    socket.on(
      "mark_read_from_notification",
      async (data: { senderId: number }) => {
        if (!socket.userId || !data?.senderId) return;
        await storage.markConversationAsRead(socket.userId, data.senderId);
        await storage.clearPendingNotificationsForUserFromSender(
          socket.userId,
          data.senderId,
        );
        await emitSidebarUsers(io, [socket.userId]);
      },
    );

    // Client reports its tab visibility state so the server knows whether to send a push
    socket.on("tab_visibility_changed", (data: { hidden: boolean }) => {
      if (data?.hidden) {
        hiddenSocketIds.add(socket.id);
      } else {
        hiddenSocketIds.delete(socket.id);
      }
    });

    socket.on("disconnect", async () => {
      await handleDisconnect(socket, io, broadcastOnlineUsers);
    });
  });

  startPeriodicCleanup(io, broadcastOnlineUsers);
}
