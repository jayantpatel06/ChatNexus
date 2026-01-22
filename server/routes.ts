import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertMessageSchema, insertGlobalMessageSchema, insertAttachmentSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { signToken, verifyToken } from "./lib/jwt";
import { jwtAuth } from "./middleware/jwt-auth";

declare module 'socket.io' {
  interface Socket {
    userId: number;
  }
}

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export function registerRoutes(app: Express): Server {
  // Setup authentication routes
  setupAuth(app);

  // Serve uploaded files
  app.use("/uploads", express.static("uploads"));

  // File upload endpoint - requires JWT auth
  app.post("/api/upload", jwtAuth, upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      filename: req.file.originalname,
      fileType: req.file.mimetype,
    });
  });

  // Get online users - requires JWT auth
  app.get("/api/users/online", jwtAuth, async (req, res, next) => {
    try {
      const onlineUsers = await storage.getOnlineUsers();
      res.json(onlineUsers);
    } catch (error) {
      next(error);
    }
  });

  // Get all recent messages for current user - requires JWT auth
  app.get("/api/messages", jwtAuth, async (req, res, next) => {
    try {
      const messages = await storage.getRecentMessagesForUser(req.jwtUser!.userId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching recent messages:', error);
      next(error);
    }
  });

  // Get messages between users (full history - legacy endpoint) - requires JWT auth
  app.get("/api/messages/:userId", jwtAuth, async (req, res, next) => {
    try {
      const { userId } = req.params;
      const otherUserId = parseInt(userId, 10);

      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const messages = await storage.getMessagesBetweenUsers(req.jwtUser!.userId, otherUserId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      next(error);
    }
  });

  // Get messages between users with cursor-based pagination - requires JWT auth
  app.get("/api/messages/:userId/history", jwtAuth, async (req, res, next) => {
    try {
      const otherUserId = parseInt(req.params.userId, 10);
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const limit = Math.min(parseInt((req.query.limit as string) ?? "40", 10) || 40, 100);
      const cursorParam = req.query.cursor as string | undefined;

      let cursor: { timestamp: string; msgId: number } | undefined;
      if (cursorParam) {
        const [tsStr, idStr] = cursorParam.split("_");
        const msgId = Number(idStr);
        if (!Number.isNaN(msgId) && tsStr) {
          cursor = { timestamp: new Date(Number(tsStr)).toISOString(), msgId };
        }
      }

      const { messages, nextCursor } = await storage.getMessagesBetweenUsersCursor(
        req.jwtUser!.userId,
        otherUserId,
        { limit, cursor }
      );

      const encodedNextCursor = nextCursor
        ? `${new Date(nextCursor.timestamp).getTime()}_${nextCursor.msgId}`
        : null;

      res.json({ messages, nextCursor: encodedNextCursor });
    } catch (error) {
      console.error('Error fetching paginated messages:', error);
      next(error);
    }
  });

  // Get global messages - requires JWT auth
  app.get("/api/global-messages", jwtAuth, async (req, res, next) => {
    try {
      const messages = await storage.getGlobalMessages();
      console.log(`[API] Fetched ${messages.length} global messages`);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching global messages:', error);
      next(error);
    }
  });

  const httpServer = createServer(app);

  // Track guest user disconnection times for grace period handling
  const guestDisconnectionTimes = new Map<number, number>();

  // Setup Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL || true // Allow same-origin in production
        : ["http://localhost:5173", "http://localhost:5000"],
      methods: ["GET", "POST"],
      credentials: true
    },
    maxHttpBufferSize: 1e7 // 10MB limit for Base64 images
  });

  // Update username - requires JWT auth
  app.put("/api/user/username", jwtAuth, async (req, res, next) => {
    try {
      const user = req.jwtUser!;
      const { username } = req.body;

      if (!username || typeof username !== "string" || username.trim().length === 0) {
        return res.status(400).json({ message: "Username is required" });
      }

      const trimmedUsername = username.trim();

      if (trimmedUsername.length < 2) {
        return res.status(400).json({ message: "Username must be at least 2 characters long" });
      }

      if (trimmedUsername.length > 20) {
        return res.status(400).json({ message: "Username must be less than 20 characters" });
      }

      if (trimmedUsername === user.username) {
        return res.status(400).json({ message: "Please choose a different username" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(trimmedUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Update the username
      const updatedUser = await storage.updateUserUsername(user.userId, trimmedUsername);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update username" });
      }

      console.log(`[API] Updated username for user ${user.userId} to ${trimmedUsername}`);

      // Broadcast updated online users list
      const onlineUsers = await storage.getOnlineUsers();
      const updatedUserInList = onlineUsers.find(u => u.userId === user.userId);
      console.log(`[API] Broadcasting online users. Updated user in list: ${updatedUserInList?.username}`);

      io.emit('online_users_updated', { users: onlineUsers });

      // Return updated user along with a new token (since username changed)
      const newToken = signToken(updatedUser);
      res.json({ user: updatedUser, token: newToken });
    } catch (error) {
      console.error('Error updating username:', error);
      next(error);
    }
  });

  // JWT-only Socket.IO authentication middleware
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

  let presenceBroadcastScheduled = false;
  const broadcastOnlineUsers = async () => {
    if (presenceBroadcastScheduled) return;
    presenceBroadcastScheduled = true;
    setTimeout(async () => {
      presenceBroadcastScheduled = false;
      const onlineUsers = await storage.getOnlineUsers();
      io.emit('online_users_updated', { users: onlineUsers });
    }, 200);
  };

  // Track pending offline updates to handle reconnection race conditions
  // (e.g., when user changes username and socket reconnects with new token)
  const pendingOfflineUpdates = new Map<number, NodeJS.Timeout>();

  io.on('connection', async (socket) => {
    console.log('Socket.IO connection established');

    // Mark user as online
    if (socket.userId) {
      // Clear any pending offline update for this user (reconnection scenario)
      const pendingOffline = pendingOfflineUpdates.get(socket.userId);
      if (pendingOffline) {
        clearTimeout(pendingOffline);
        pendingOfflineUpdates.delete(socket.userId);
        console.log(`Cleared pending offline update for user ${socket.userId} (reconnected)`);
      }

      await storage.updateUserOnlineStatus(socket.userId, true);

      // Join user to their own room for O(1) messaging
      socket.join(`user:${socket.userId}`);

      // Clear any pending deletion for this guest user
      guestDisconnectionTimes.delete(socket.userId);

      // Broadcast updated online users list (debounced)
      await broadcastOnlineUsers();
    }

    // Handle private messages
    socket.on('private_message', async (data) => {
      try {
        if (socket.userId && data.receiverId && (data.message || data.attachment)) {
          const minId = Math.min(socket.userId, data.receiverId);
          const maxId = Math.max(socket.userId, data.receiverId);
          const conversationId = `${minId}:${maxId}`;

          // Create a temporary message object for immediate delivery
          const tempMessage = {
            msgId: Date.now(), // Temporary ID, will be replaced
            senderId: socket.userId,
            receiverId: data.receiverId,
            conversationId,
            message: data.message || "Sent an attachment",
            timestamp: new Date(),
            attachments: data.attachment ? [{
              id: Date.now(),
              url: data.attachment.url,
              filename: data.attachment.filename,
              fileType: data.attachment.fileType,
            }] : [],
          };

          // 🚀 IMMEDIATELY send to receiver (before DB save)
          io.to(`user:${data.receiverId}`).emit('new_message', { message: tempMessage });

          // 🚀 IMMEDIATELY confirm to sender
          socket.emit('message_sent', {
            message: tempMessage,
            clientMessageId: data.clientMessageId,
          });

          // Now save to database asynchronously (non-blocking)
          setImmediate(async () => {
            try {
              const validatedMessage = insertMessageSchema.parse({
                senderId: socket.userId,
                receiverId: data.receiverId,
                conversationId,
                message: data.message || "Sent an attachment"
              });

              const savedMessage = await storage.createMessage(validatedMessage);

              // Handle attachment if present
              if (data.attachment) {
                const attachmentData = insertAttachmentSchema.parse({
                  messageId: savedMessage.msgId,
                  url: data.attachment.url,
                  filename: data.attachment.filename,
                  fileType: data.attachment.fileType
                });
                await storage.createAttachment(attachmentData);
              }
            } catch (dbError) {
              console.error('Error saving message to database:', dbError);
              // Optionally notify sender of save failure
              socket.emit('message_save_error', { clientMessageId: data.clientMessageId });
            }
          });
        }
      } catch (error) {
        console.error('Socket.IO private_message error:', error);
      }
    });

    // Handle global messages
    socket.on('global_message', async (data) => {
      try {
        if (socket.userId && data.message) {
          const validatedMessage = insertGlobalMessageSchema.parse({
            senderId: socket.userId,
            message: data.message
          });

          const savedMessage = await storage.createGlobalMessage(validatedMessage);
          console.log(`[Socket] Created global message: ${savedMessage.id} from user ${socket.userId}`);

          // Broadcast to all connected clients
          io.emit('global_message', { message: savedMessage });
        }
      } catch (error) {
        console.error('Socket.IO global_message error:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing_start', async (data) => {
      try {
        if (socket.userId && data.receiverId) {
          io.to(`user:${data.receiverId}`).emit('user_typing', {
            userId: socket.userId,
            isTyping: true
          });
        }
      } catch (error) {
        console.error('Socket.IO typing_start error:', error);
      }
    });

    socket.on('typing_stop', async (data) => {
      try {
        if (socket.userId && data.receiverId) {
          io.to(`user:${data.receiverId}`).emit('user_typing', {
            userId: socket.userId,
            isTyping: false
          });
        }
      } catch (error) {
        console.error('Socket.IO typing_stop error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('Socket.IO client disconnected');
      if (socket.userId) {
        const userId = socket.userId;
        
        // Delay offline update to handle reconnection scenarios (e.g., token refresh)
        // This prevents brief "offline" flashes when user is just reconnecting
        const offlineTimeout = setTimeout(async () => {
          pendingOfflineUpdates.delete(userId);
          
          // Get user info to check if they are a guest
          const user = await storage.getUser(userId);

          // Only update online status if user still exists
          if (user) {
            await storage.updateUserOnlineStatus(userId, false);

            // For guest users, track disconnection time for grace period
            if (user.isGuest) {
              guestDisconnectionTimes.set(userId, Date.now());
              console.log(`Guest user ${user.username} (ID: ${userId}) disconnected, starting grace period`);
            }
          } else {
            console.log(`User ${userId} no longer exists in database`);
          }

          // Broadcast updated online users list (debounced)
          await broadcastOnlineUsers();
        }, 2000); // 2 second grace period for reconnection
        
        pendingOfflineUpdates.set(userId, offlineTimeout);
      }
    });
  });

  // Periodic cleanup of stale users and guest deletion after grace period (every 30 seconds)
  setInterval(async () => {
    try {
      const now = Date.now();

      // Cleanup old attachments (older than 5 minutes)
      // DISABLED: User wants to keep attachments for now
      /*
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const oldAttachments = await storage.getOldAttachments(fiveMinutesAgo);

      for (const attachment of oldAttachments) {
        // Delete file from disk
        const filePath = path.join(process.cwd(), "uploads", path.basename(attachment.url));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted expired attachment file: ${filePath}`);
        }

        // Delete from database
        await storage.deleteAttachment(attachment.id);
        console.log(`Deleted expired attachment record: ${attachment.id}`);
      }
      */

      const gracePeriod = 30 * 1000; // 30 seconds grace period

      // Get all currently connected socket user IDs
      const connectedUserIds = new Set<number>();
      io.sockets.sockets.forEach((socket) => {
        if (socket.userId) {
          connectedUserIds.add(socket.userId);
        }
      });

      // Check disconnected guest users for deletion
      const usersToDelete: number[] = [];

      for (const [userId, disconnectionTime] of guestDisconnectionTimes.entries()) {
        // If user reconnected, remove from tracking
        if (connectedUserIds.has(userId)) {
          guestDisconnectionTimes.delete(userId);
          continue;
        }

        // If grace period has passed, mark for deletion
        if (now - disconnectionTime >= gracePeriod) {
          const user = await storage.getUser(userId);
          if (user && user.isGuest) {
            usersToDelete.push(userId);
          }
          guestDisconnectionTimes.delete(userId);
        }
      }

      // Delete guest users who exceeded grace period
      for (const userId of usersToDelete) {
        const user = await storage.getUser(userId);
        if (user) {
          await storage.deleteUser(userId);
          console.log(`Deleted guest user ${user.username} (ID: ${userId}) after grace period`);
        }
      }

      // Handle regular users - mark offline if disconnected
      const onlineUsers = await storage.getOnlineUsers();
      for (const user of onlineUsers) {
        if (!user.isGuest && !connectedUserIds.has(user.userId)) {
          await storage.updateUserOnlineStatus(user.userId, false);
          console.log(`Marked user ${user.userId} (${user.username}) as offline due to no active connection`);
        }
      }

      // Broadcast updated online users list if any changes were made (debounced)
      if (usersToDelete.length > 0) {
        await broadcastOnlineUsers();
      }
    } catch (error) {
      console.error('Error during periodic cleanup:', error);
    }
  }, 30 * 1000); // Check every 30 seconds

  return httpServer;
}
