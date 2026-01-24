import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import express from 'express';
import multer from 'multer';
import { setupAuth } from './auth';
import { storage } from './storage';
import { signToken } from './lib/jwt';
import { jwtAuth } from './middleware/jwt-auth';
import { setupSocketAuth, setupSocketHandlers, SOCKET_CONFIG } from './socket';
import './types/socket'; // Import socket type extensions

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export function registerRoutes(app: Express): Server {
  // Setup authentication routes
  setupAuth(app);

  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

  // ============================================
  // FILE UPLOAD
  // ============================================
  
  app.post('/api/upload', jwtAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      filename: req.file.originalname,
      fileType: req.file.mimetype,
    });
  });

  // ============================================
  // USER ENDPOINTS
  // ============================================

  app.get('/api/users/online', jwtAuth, async (req, res, next) => {
    try {
      const onlineUsers = await storage.getOnlineUsers();
      res.json(onlineUsers);
    } catch (error) {
      next(error);
    }
  });

  // ============================================
  // MESSAGE ENDPOINTS
  // ============================================

  app.get('/api/messages', jwtAuth, async (req, res, next) => {
    try {
      const messages = await storage.getRecentMessagesForUser(req.jwtUser!.userId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching recent messages:', error);
      next(error);
    }
  });

  // Cursor-based paginated message history
  app.get('/api/messages/:userId/history', jwtAuth, async (req, res, next) => {
    try {
      const otherUserId = parseInt(req.params.userId, 10);
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const limit = Math.min(parseInt((req.query.limit as string) ?? '40', 10) || 40, 100);
      const cursorParam = req.query.cursor as string | undefined;

      let cursor: { timestamp: string; msgId: number } | undefined;
      if (cursorParam) {
        const [tsStr, idStr] = cursorParam.split('_');
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

  // ============================================
  // GLOBAL MESSAGES
  // ============================================

  app.get('/api/global-messages', jwtAuth, async (req, res, next) => {
    try {
      const messages = await storage.getGlobalMessages();
      console.log(`[API] Fetched ${messages.length} global messages`);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching global messages:', error);
      next(error);
    }
  });

  // ============================================
  // SOCKET.IO SETUP
  // ============================================

  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.FRONTEND_URL || true
          : ['http://localhost:5173', 'http://localhost:5000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e7, // 10MB limit for Base64 images
  });

  // ============================================
  // USERNAME UPDATE (needs io for broadcasting)
  // ============================================

  app.put('/api/user/username', jwtAuth, async (req, res, next) => {
    try {
      const user = req.jwtUser!;
      const { username } = req.body;

      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ message: 'Username is required' });
      }

      const trimmedUsername = username.trim();

      if (trimmedUsername.length < 2) {
        return res.status(400).json({ message: 'Username must be at least 2 characters long' });
      }

      if (trimmedUsername.length > 20) {
        return res.status(400).json({ message: 'Username must be less than 20 characters' });
      }

      if (trimmedUsername === user.username) {
        return res.status(400).json({ message: 'Please choose a different username' });
      }

      const existingUser = await storage.getUserByUsername(trimmedUsername);
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      const updatedUser = await storage.updateUserUsername(user.userId, trimmedUsername);
      if (!updatedUser) {
        return res.status(500).json({ message: 'Failed to update username' });
      }

      console.log(`[API] Updated username for user ${user.userId} to ${trimmedUsername}`);

      // Broadcast updated online users list
      const onlineUsers = await storage.getOnlineUsers();
      io.emit('online_users_updated', { users: onlineUsers });

      // Return updated user with new token
      const newToken = signToken(updatedUser);
      res.json({ user: updatedUser, token: newToken });
    } catch (error) {
      console.error('Error updating username:', error);
      next(error);
    }
  });

  // Setup Socket.IO authentication and handlers
  setupSocketAuth(io);
  setupSocketHandlers(io);

  return httpServer;
}
