import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from './lib/jwt';
import { storage } from './storage';
import { insertMessageSchema, insertGlobalMessageSchema, insertAttachmentSchema } from '@shared/schema';
import './types/socket'; // Import socket type extensions

// Configuration constants
export const SOCKET_CONFIG = {
  PRESENCE_BROADCAST_DELAY_MS: 200,
  OFFLINE_GRACE_PERIOD_MS: 2000,
  GUEST_DELETION_GRACE_PERIOD_MS: 30 * 1000,
  CLEANUP_INTERVAL_MS: 30 * 1000,
  ATTACHMENT_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
};

// Track guest user disconnection times for grace period handling
const guestDisconnectionTimes = new Map<number, number>();

// Track pending offline updates to handle reconnection race conditions
const pendingOfflineUpdates = new Map<number, NodeJS.Timeout>();

/**
 * Setup Socket.IO authentication middleware
 */
export function setupSocketAuth(io: SocketIOServer): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required: No token provided'));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Authentication required: Invalid or expired token'));
    }

    socket.userId = decoded.userId;
    next();
  });
}

/**
 * Create debounced broadcast function for online users
 */
export function createPresenceBroadcaster(io: SocketIOServer) {
  let presenceBroadcastScheduled = false;
  
  return async () => {
    if (presenceBroadcastScheduled) return;
    presenceBroadcastScheduled = true;
    
    setTimeout(async () => {
      presenceBroadcastScheduled = false;
      const onlineUsers = await storage.getOnlineUsers();
      io.emit('online_users_updated', { users: onlineUsers });
    }, SOCKET_CONFIG.PRESENCE_BROADCAST_DELAY_MS);
  };
}

/**
 * Setup socket connection handlers
 */
export function setupSocketHandlers(io: SocketIOServer): void {
  const broadcastOnlineUsers = createPresenceBroadcaster(io);

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
      await handlePrivateMessage(socket, io, data);
    });

    // Handle global messages
    socket.on('global_message', async (data) => {
      await handleGlobalMessage(socket, io, data);
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      handleTypingStart(socket, io, data);
    });

    socket.on('typing_stop', (data) => {
      handleTypingStop(socket, io, data);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      await handleDisconnect(socket, broadcastOnlineUsers);
    });
  });

  // Start periodic cleanup
  startPeriodicCleanup(io, broadcastOnlineUsers);
}

/**
 * Handle private message event
 */
async function handlePrivateMessage(
  socket: Socket,
  io: SocketIOServer,
  data: { receiverId?: number; message?: string; clientMessageId?: string; attachment?: { url: string; filename: string; fileType: string } }
): Promise<void> {
  try {
    if (!socket.userId || !data.receiverId || (!data.message && !data.attachment)) {
      return;
    }

    const minId = Math.min(socket.userId, data.receiverId);
    const maxId = Math.max(socket.userId, data.receiverId);
    const conversationId = `${minId}:${maxId}`;

    // Create a temporary message object for immediate delivery
    const tempMessage = {
      msgId: Date.now(),
      senderId: socket.userId,
      receiverId: data.receiverId,
      conversationId,
      message: data.message || 'Sent an attachment',
      timestamp: new Date(),
      attachments: data.attachment ? [{
        id: Date.now(),
        url: data.attachment.url,
        filename: data.attachment.filename,
        fileType: data.attachment.fileType,
      }] : [],
    };

    // IMMEDIATELY send to receiver (before DB save)
    io.to(`user:${data.receiverId}`).emit('new_message', { message: tempMessage });

    // IMMEDIATELY confirm to sender
    socket.emit('message_sent', {
      message: tempMessage,
      clientMessageId: data.clientMessageId,
    });

    // Save to database asynchronously with proper error handling
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
          message: messageText || 'Sent an attachment'
        });

        const savedMessage = await storage.createMessage(validatedMessage);

        // Handle attachment if present
        if (attachment) {
          const attachmentData = insertAttachmentSchema.parse({
            messageId: savedMessage.msgId,
            url: attachment.url,
            filename: attachment.filename,
            fileType: attachment.fileType
          });
          await storage.createAttachment(attachmentData);
        }
      } catch (dbError) {
        console.error('Error saving message to database:', dbError);
        // Notify sender of save failure with error details
        socket.emit('message_save_error', { 
          clientMessageId,
          error: 'Failed to persist message'
        });
      }
    });
  } catch (error) {
    console.error('Socket.IO private_message error:', error);
  }
}

/**
 * Handle global message event
 */
async function handleGlobalMessage(
  socket: Socket,
  io: SocketIOServer,
  data: { message?: string }
): Promise<void> {
  try {
    if (!socket.userId || !data.message) {
      return;
    }

    const validatedMessage = insertGlobalMessageSchema.parse({
      senderId: socket.userId,
      message: data.message
    });

    const savedMessage = await storage.createGlobalMessage(validatedMessage);
    console.log(`[Socket] Created global message: ${savedMessage.id} from user ${socket.userId}`);

    // Broadcast to all connected clients
    io.emit('global_message', { message: savedMessage });
  } catch (error) {
    console.error('Socket.IO global_message error:', error);
  }
}

/**
 * Handle typing start event
 */
function handleTypingStart(
  socket: Socket,
  io: SocketIOServer,
  data: { receiverId?: number }
): void {
  if (socket.userId && data.receiverId) {
    io.to(`user:${data.receiverId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping: true
    });
  }
}

/**
 * Handle typing stop event
 */
function handleTypingStop(
  socket: Socket,
  io: SocketIOServer,
  data: { receiverId?: number }
): void {
  if (socket.userId && data.receiverId) {
    io.to(`user:${data.receiverId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping: false
    });
  }
}

/**
 * Handle socket disconnection
 */
async function handleDisconnect(
  socket: Socket,
  broadcastOnlineUsers: () => Promise<void>
): Promise<void> {
  console.log('Socket.IO client disconnected');
  
  if (!socket.userId) return;
  
  const userId = socket.userId;
  
  // Delay offline update to handle reconnection scenarios
  const offlineTimeout = setTimeout(async () => {
    pendingOfflineUpdates.delete(userId);
    
    const user = await storage.getUser(userId);

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

    await broadcastOnlineUsers();
  }, SOCKET_CONFIG.OFFLINE_GRACE_PERIOD_MS);
  
  pendingOfflineUpdates.set(userId, offlineTimeout);
}

/**
 * Start periodic cleanup of stale users, guests, and attachments
 */
function startPeriodicCleanup(
  io: SocketIOServer,
  broadcastOnlineUsers: () => Promise<void>
): void {
  setInterval(async () => {
    try {
      const now = Date.now();

      // Cleanup old attachments (older than 24 hours)
      await cleanupOldAttachments(now);

      // Get all currently connected socket user IDs
      const connectedUserIds = new Set<number>();
      io.sockets.sockets.forEach((socket) => {
        if (socket.userId) {
          connectedUserIds.add(socket.userId);
        }
      });

      // Cleanup disconnected guest users
      const deletedUsers = await cleanupGuestUsers(now, connectedUserIds);

      // Mark offline any registered users without active connections
      await cleanupOfflineUsers(connectedUserIds);

      // Broadcast if any users were deleted
      if (deletedUsers > 0) {
        await broadcastOnlineUsers();
      }
    } catch (error) {
      console.error('Error during periodic cleanup:', error);
    }
  }, SOCKET_CONFIG.CLEANUP_INTERVAL_MS);
}

/**
 * Cleanup old attachments from disk and database
 */
async function cleanupOldAttachments(now: number): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  const maxAge = new Date(now - SOCKET_CONFIG.ATTACHMENT_MAX_AGE_MS);
  const oldAttachments = await storage.getOldAttachments(maxAge);

  for (const attachment of oldAttachments) {
    try {
      // Delete file from disk
      const filePath = path.join(process.cwd(), 'uploads', path.basename(attachment.url));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted expired attachment file: ${filePath}`);
      }

      // Delete from database
      await storage.deleteAttachment(attachment.id);
      console.log(`Deleted expired attachment record: ${attachment.id}`);
    } catch (err) {
      console.error(`Error deleting attachment ${attachment.id}:`, err);
    }
  }
}

/**
 * Cleanup disconnected guest users after grace period
 */
async function cleanupGuestUsers(
  now: number,
  connectedUserIds: Set<number>
): Promise<number> {
  const usersToDelete: number[] = [];

  for (const [userId, disconnectionTime] of guestDisconnectionTimes.entries()) {
    // If user reconnected, remove from tracking
    if (connectedUserIds.has(userId)) {
      guestDisconnectionTimes.delete(userId);
      continue;
    }

    // If grace period has passed, mark for deletion
    if (now - disconnectionTime >= SOCKET_CONFIG.GUEST_DELETION_GRACE_PERIOD_MS) {
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

  return usersToDelete.length;
}

/**
 * Mark offline any registered users without active socket connections
 */
async function cleanupOfflineUsers(connectedUserIds: Set<number>): Promise<void> {
  const onlineUsers = await storage.getOnlineUsers();
  
  for (const user of onlineUsers) {
    if (!user.isGuest && !connectedUserIds.has(user.userId)) {
      await storage.updateUserOnlineStatus(user.userId, false);
      console.log(`Marked user ${user.userId} (${user.username}) as offline due to no active connection`);
    }
  }
}
