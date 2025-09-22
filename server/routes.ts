import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertMessageSchema } from "@shared/schema";
import { parse as parseCookie } from "cookie";
import session from "express-session";

interface AuthenticatedSocket {
  userId?: number;
}

export function registerRoutes(app: Express): Server {
  // Setup authentication routes
  setupAuth(app);

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

  // Get all recent messages for current user
  app.get("/api/messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get recent messages involving the current user
      const messages = await storage.getRecentMessagesForUser(req.user!.userId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching recent messages:', error);
      next(error);
    }
  });

  const httpServer = createServer(app);

  // Setup Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL || true // Allow same-origin in production
        : ["http://localhost:5173", "http://localhost:5000"],
      methods: ["GET", "POST"],
      credentials: true
    }
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
      
      // Broadcast updated online users list
      const onlineUsers = await storage.getOnlineUsers();
      io.emit('online_users_updated', { users: onlineUsers });
    }

    // Handle private messages
    socket.on('private_message', async (data) => {
      try {
        if (authenticatedSocket.userId && data.receiverId && data.message) {
          const validatedMessage = insertMessageSchema.parse({
            senderId: authenticatedSocket.userId,
            receiverId: data.receiverId,
            message: data.message
          });

          const savedMessage = await storage.createMessage(validatedMessage);

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
        await storage.updateUserOnlineStatus(authenticatedSocket.userId, false);
        
        // Broadcast updated online users list
        const onlineUsers = await storage.getOnlineUsers();
        io.emit('online_users_updated', { users: onlineUsers });
      }
    });
  });

  // Periodic cleanup of stale online users (every 5 minutes)
  setInterval(async () => {
    try {
      // Get all currently connected socket user IDs
      const connectedUserIds = new Set<number>();
      io.sockets.sockets.forEach((socket: any) => {
        if (socket.userId) {
          connectedUserIds.add(socket.userId);
        }
      });

      // Get all users marked as online in database
      const onlineUsers = await storage.getOnlineUsers();
      
      // Mark users as offline if they don't have an active socket connection
      for (const user of onlineUsers) {
        if (!connectedUserIds.has(user.userId)) {
          await storage.updateUserOnlineStatus(user.userId, false);
          console.log(`Marked user ${user.userId} (${user.username}) as offline due to no active connection`);
        }
      }
    } catch (error) {
      console.error('Error during periodic online status cleanup:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  return httpServer;
}
