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

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

interface AuthenticatedSocket {
  userId?: number;
}

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

  // Get messages between users
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

  // Get global messages
  app.get("/api/global-messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const messages = await storage.getGlobalMessages();
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

  // Socket.IO middleware for authentication
  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie ? parseCookie(socket.handshake.headers.cookie) : {};
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        console.log('Socket.IO connection rejected: No session cookie');
        return next(new Error('Authentication required'));
      }

      // Get session from store
      const sessionData = await new Promise<any>((resolve, reject) => {
        storage.sessionStore.get(sessionId.split('.')[0].substring(2), (err: any, session: any) => {
          if (err) reject(err);
          else resolve(session);
        });
      });

      if (!sessionData || !sessionData.passport?.user) {
        console.log('Socket.IO connection rejected: Invalid session');
        return next(new Error('Authentication required'));
      }

      (socket as any).userId = sessionData.passport.user;
      console.log(`Socket.IO authenticated for user: ${(socket as any).userId}`);
      next();
    } catch (error) {
      console.error('Socket.IO authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const authenticatedSocket = socket as any;
    console.log('Socket.IO connection established');

    // Mark user as online
    if (authenticatedSocket.userId) {
      await storage.updateUserOnlineStatus(authenticatedSocket.userId, true);

      // Clear any pending deletion for this guest user
      guestDisconnectionTimes.delete(authenticatedSocket.userId);

      // Broadcast updated online users list
      const onlineUsers = await storage.getOnlineUsers();
      io.emit('online_users_updated', { users: onlineUsers });
    }

    // Handle private messages
    socket.on('private_message', async (data) => {
      try {
        if (authenticatedSocket.userId && data.receiverId && (data.message || data.attachment)) {
          const validatedMessage = insertMessageSchema.parse({
            senderId: authenticatedSocket.userId,
            receiverId: data.receiverId,
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

          // Send to receiver
          const receiverSockets = Array.from(io.sockets.sockets.values())
            .filter((s: any) => s.userId === data.receiverId);

          receiverSockets.forEach((receiverSocket: any) => {
            receiverSocket.emit('new_message', { message: savedMessage });
          });

          // Send back to sender for confirmation
          socket.emit('message_sent', { message: savedMessage });
        }
      } catch (error) {
        console.error('Socket.IO private_message error:', error);
      }
    });

    // Handle global messages
    socket.on('global_message', async (data) => {
      try {
        if (authenticatedSocket.userId && data.message) {
          const validatedMessage = insertGlobalMessageSchema.parse({
            senderId: authenticatedSocket.userId,
            message: data.message
          });

          const savedMessage = await storage.createGlobalMessage(validatedMessage);

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
        if (authenticatedSocket.userId && data.receiverId) {
          const receiverSockets = Array.from(io.sockets.sockets.values())
            .filter((s: any) => s.userId === data.receiverId);

          receiverSockets.forEach((receiverSocket: any) => {
            receiverSocket.emit('user_typing', {
              userId: authenticatedSocket.userId,
              isTyping: true
            });
          });
        }
      } catch (error) {
        console.error('Socket.IO typing_start error:', error);
      }
    });

    socket.on('typing_stop', async (data) => {
      try {
        if (authenticatedSocket.userId && data.receiverId) {
          const receiverSockets = Array.from(io.sockets.sockets.values())
            .filter((s: any) => s.userId === data.receiverId);

          receiverSockets.forEach((receiverSocket: any) => {
            receiverSocket.emit('user_typing', {
              userId: authenticatedSocket.userId,
              isTyping: false
            });
          });
        }
      } catch (error) {
        console.error('Socket.IO typing_stop error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('Socket.IO client disconnected');
      if (authenticatedSocket.userId) {
        // Get user info to check if they are a guest
        const user = await storage.getUser(authenticatedSocket.userId);

        // Only update online status if user still exists
        if (user) {
          await storage.updateUserOnlineStatus(authenticatedSocket.userId, false);

          // For guest users, track disconnection time for grace period
          if (user.isGuest) {
            guestDisconnectionTimes.set(authenticatedSocket.userId, Date.now());
            console.log(`Guest user ${user.username} (ID: ${authenticatedSocket.userId}) disconnected, starting grace period`);
          }
        } else {
          console.log(`User ${authenticatedSocket.userId} no longer exists in database`);
        }

        // Broadcast updated online users list
        const onlineUsers = await storage.getOnlineUsers();
        io.emit('online_users_updated', { users: onlineUsers });
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
      io.sockets.sockets.forEach((socket: any) => {
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

      // Broadcast updated online users list if any changes were made
      if (usersToDelete.length > 0) {
        const updatedOnlineUsers = await storage.getOnlineUsers();
        io.emit('online_users_updated', { users: updatedOnlineUsers });
      }
    } catch (error) {
      console.error('Error during periodic cleanup:', error);
    }
  }, 30 * 1000); // Check every 30 seconds

  return httpServer;
}
