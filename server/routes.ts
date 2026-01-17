import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertMessageSchema, insertGlobalMessageSchema, insertAttachmentSchema } from "@shared/schema";
import { parse as parseCookie } from "cookie";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { signToken, verifyToken } from "./lib/jwt";
import passport from "passport"; // Added for new Socket.IO middleware

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

  // File upload endpoint
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

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

  // Get online users
  app.get("/api/users/online", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const onlineUsers = await storage.getOnlineUsers();
      res.json(onlineUsers);
    } catch (error) {
      next(error);
    }
  });

  // Get all recent messages for current user
  app.get("/api/messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const messages = await storage.getRecentMessagesForUser(req.user!.userId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching recent messages:', error);
      next(error);
    }
  });

  // Get JWT token for authenticated user
  app.get("/api/auth/token", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const token = signToken(req.user!);
    res.json({ token });
  });

  // Register new user (if allowed by auth strategy)
  app.post("/api/register", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      // This endpoint would typically handle new user registration,
      // but the provided snippet only includes the authentication check.
      // Assuming further logic would be here to create a new user.
      res.status(501).json({ message: "Registration not fully implemented" });
    } catch (error) {
      next(error);
    }
  });

  // Get messages between users (full history - legacy endpoint)
  app.get("/api/messages/:userId", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { userId } = req.params;
      const otherUserId = parseInt(userId, 10);

      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const messages = await storage.getMessagesBetweenUsers(req.user!.userId, otherUserId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      next(error);
    }
  });

  // Get messages between users with cursor-based pagination (optimized for recent messages)
  app.get("/api/messages/:userId/history", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

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
        req.user!.userId,
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

  // Get global messages
  app.get("/api/global-messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

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

  // Update username
  app.put("/api/user/username", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

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

      if (trimmedUsername === req.user!.username) {
        return res.status(400).json({ message: "Please choose a different username" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(trimmedUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Update the username
      const updatedUser = await storage.updateUserUsername(req.user!.userId, trimmedUsername);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update username" });
      }

      console.log(`[API] Updated username for user ${req.user!.userId} to ${trimmedUsername}`);

      // Broadcast updated online users list
      const onlineUsers = await storage.getOnlineUsers();
      const updatedUserInList = onlineUsers.find(u => u.userId === req.user!.userId);
      console.log(`[API] Broadcasting online users. Updated user in list: ${updatedUserInList?.username}`);

      io.emit('online_users_updated', { users: onlineUsers });

      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating username:', error);
      next(error);
    }
  });

  // Create a session middleware instance for Socket.IO
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  });

  // Middleware to authenticate socket connections
  io.use((socket, next) => {
    // 1. Try JWT from handshake auth
    const token = socket.handshake.auth.token;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        socket.userId = decoded.userId;
        return next();
      }
      // If token is invalid, we could reject, but for now we fall back to session
      // to support clients during transition or dual-mode.
      // console.log("Invalid token, falling back to session");
    }

    // 2. Fallback to Session Cookie
    const req = socket.request as any;
    const res = {} as any;

    sessionMiddleware(req, res, () => {
      passport.initialize()(req, res, () => {
        passport.session()(req, res, () => {
          if (req.isAuthenticated()) {
            socket.userId = req.user.userId;
            next();
          } else {
            next(new Error("Authentication required"));
          }
        });
      });
    });
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

  io.on('connection', async (socket) => {
    console.log('Socket.IO connection established');

    // Mark user as online
    if (socket.userId) {
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
            // Attach to message object for client
            (savedMessage as any).attachments = [attachmentData];
          }

          // Send to receiver using rooms - O(1) lookup
          io.to(`user:${data.receiverId}`).emit('new_message', { message: savedMessage });

          // Send back to sender for confirmation, including optional clientMessageId
          socket.emit('message_sent', {
            message: savedMessage,
            clientMessageId: data.clientMessageId,
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
        // Get user info to check if they are a guest
        const user = await storage.getUser(socket.userId);

        // Only update online status if user still exists
        if (user) {
          await storage.updateUserOnlineStatus(socket.userId, false);

          // For guest users, track disconnection time for grace period
          if (user.isGuest) {
            guestDisconnectionTimes.set(socket.userId, Date.now());
            console.log(`Guest user ${user.username} (ID: ${socket.userId}) disconnected, starting grace period`);
          }
        } else {
          console.log(`User ${socket.userId} no longer exists in database`);
        }

        // Broadcast updated online users list (debounced)
        await broadcastOnlineUsers();
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
