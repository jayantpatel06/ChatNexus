import {
  type User,
  type InsertUser,
  type Message,
  type InsertMessage,
  type GlobalMessage,
  type InsertGlobalMessage,
  type GlobalMessageWithSender,
  type Attachment,
  type InsertAttachment,
} from '@shared/schema';
import { prisma } from './db';
import { createClient, type RedisClientType } from 'redis';

// Storage interface - defines all database operations
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGmail(gmail: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: number): Promise<void>;
  updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  updateUserUsername(id: number, username: string): Promise<User | undefined>;
  getOnlineUsers(): Promise<User[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesBetweenUsersCursor(
    user1Id: number,
    user2Id: number,
    opts: { limit: number; cursor?: { timestamp: string; msgId: number } }
  ): Promise<{ messages: Message[]; nextCursor: { timestamp: string; msgId: number } | null }>;
  getRecentMessagesForUser(userId: number): Promise<Message[]>;
  createGlobalMessage(message: InsertGlobalMessage): Promise<GlobalMessageWithSender>;
  getGlobalMessages(limit?: number): Promise<GlobalMessageWithSender[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  deleteAttachment(id: number): Promise<void>;
  getOldAttachments(olderThan: Date): Promise<Attachment[]>;
  getConversationStats(
    userId: number,
    otherUserIds: number[]
  ): Promise<Map<number, { lastMessage: Message | null; unread: number }>>;
}

// Cache key generators
const CacheKeys = {
  conversation: (a: number, b: number) => {
    const [u1, u2] = a < b ? [a, b] : [b, a];
    return `chatnexus:dm:${u1}:${u2}:recent`;
  },
  conversationLast: (conversationId: string) => `chatnexus:conv:${conversationId}:last`,
  conversationUnread: (conversationId: string, userId: number) =>
    `chatnexus:conv:${conversationId}:unread:${userId}`,
  globalMessages: () => 'chatnexus:global:recent',
};

// Cache TTL constants (in seconds)
const CacheTTL = {
  CONVERSATION: 120, // 2 minutes
  LAST_MESSAGE: 60,
  GLOBAL_MESSAGES: 60,
};

// Optional Redis client for caching
let cacheClient: RedisClientType | null = null;

async function initializeCache(): Promise<void> {
  if (!process.env.REDIS_URL) return;

  try {
    cacheClient = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 5000 },
    });

    cacheClient.on('error', (err) => {
      console.error('Redis cache error:', err);
    });

    await cacheClient.connect();
    console.log('✅ Redis cache connected');
  } catch (err) {
    console.error('Failed to initialize Redis cache:', err);
    cacheClient = null;
  }
}

// Initialize cache on module load
initializeCache();

/**
 * Database Storage Implementation using Prisma
 */
class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { userId: id },
      });
      return user ?? undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findFirst({
        where: { username },
      });
      return user ?? undefined;
    } catch (error) {
      console.error('Error getting user by username:', error);
      return undefined;
    }
  }

  async getUserByGmail(gmail: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { gmail },
      });
      return user ?? undefined;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!prisma) throw new Error('Database not initialized');
    try {
      return await prisma.user.create({
        data: insertUser,
      });
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async deleteUser(id: number): Promise<void> {
    if (!prisma) return;
    try {
      // Delete in order: attachments → messages → global messages → user
      // Prisma handles cascading but being explicit is safer
      await prisma.message.deleteMany({
        where: {
          OR: [{ senderId: id }, { receiverId: id }],
        },
      });

      await prisma.globalMessage.deleteMany({
        where: { senderId: id },
      });

      await prisma.user.delete({
        where: { userId: id },
      });
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.user.update({
        where: { userId: id },
        data: { isOnline },
      });
    } catch (error) {
      console.error('Error updating user online status:', error);
    }
  }

  async updateUserUsername(id: number, username: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: { username },
      });
    } catch (error) {
      console.error('Error updating username:', error);
      return undefined;
    }
  }

  async getOnlineUsers(): Promise<User[]> {
    if (!prisma) return [];
    try {
      return await prisma.user.findMany({
        where: { isOnline: true },
      });
    } catch (error) {
      console.error('Error getting online users:', error);
      return [];
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    if (!prisma) throw new Error('Database not initialized');
    try {
      const createdMessage = await prisma.message.create({
        data: message,
      });

      // Update caches (best-effort, non-blocking)
      this.updateMessageCaches(createdMessage).catch((err) =>
        console.error('Cache update error:', err)
      );

      return createdMessage;
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  private async updateMessageCaches(message: Message): Promise<void> {
    if (!cacheClient) return;

    const { senderId, receiverId, conversationId } = message;
    if (!senderId || !receiverId) return;

    const convId = conversationId || this.getConversationId(senderId, receiverId);

    // Update last message cache
    const lastKey = CacheKeys.conversationLast(convId);
    await cacheClient.set(lastKey, JSON.stringify(message), { EX: CacheTTL.LAST_MESSAGE });

    // Increment unread count for receiver
    const unreadKey = CacheKeys.conversationUnread(convId, receiverId);
    await cacheClient.incr(unreadKey);

    // Invalidate conversation cache
    const dmCacheKey = CacheKeys.conversation(senderId, receiverId);
    await cacheClient.del(dmCacheKey);
  }

  private getConversationId(user1: number, user2: number): string {
    const [minId, maxId] = user1 < user2 ? [user1, user2] : [user2, user1];
    return `${minId}:${maxId}`;
  }

  async getMessagesBetweenUsersCursor(
    user1Id: number,
    user2Id: number,
    opts: { limit: number; cursor?: { timestamp: string; msgId: number } }
  ): Promise<{ messages: Message[]; nextCursor: { timestamp: string; msgId: number } | null }> {
    if (!prisma) return { messages: [], nextCursor: null };

    const { limit, cursor } = opts;
    const conversationId = this.getConversationId(user1Id, user2Id);

    // Try cache for first page
    if (cacheClient && !cursor) {
      try {
        const cached = await cacheClient.get(CacheKeys.conversation(user1Id, user2Id));
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        console.error('Cache read error:', err);
      }
    }

    try {
      const raw = await prisma.message.findMany({
        where: { conversationId },
        orderBy: [{ timestamp: 'desc' }, { msgId: 'desc' }],
        take: limit + 1,
        cursor: cursor
          ? {
              timestamp_msgId: {
                timestamp: new Date(cursor.timestamp),
                msgId: cursor.msgId,
              },
            }
          : undefined,
        skip: cursor ? 1 : 0,
        include: { attachments: true },
      });

      const hasMore = raw.length > limit;
      const messages = hasMore ? raw.slice(0, limit) : raw;
      const last = messages[messages.length - 1];
      const nextCursor = hasMore
        ? { timestamp: last.timestamp.toISOString(), msgId: last.msgId }
        : null;

      // Cache first page only
      if (cacheClient && !cursor && messages.length > 0) {
        const cacheKey = CacheKeys.conversation(user1Id, user2Id);
        await cacheClient
          .set(cacheKey, JSON.stringify({ messages, nextCursor }), {
            EX: CacheTTL.CONVERSATION,
          })
          .catch((err) => console.error('Cache write error:', err));
      }

      return { messages, nextCursor };
    } catch (error) {
      console.error('Error getting paginated messages:', error);
      return { messages: [], nextCursor: null };
    }
  }

  async getRecentMessagesForUser(userId: number): Promise<Message[]> {
    if (!prisma) return [];
    try {
      return await prisma.message.findMany({
        where: {
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
        include: { attachments: true },
      });
    } catch (error) {
      console.error('Error getting recent messages:', error);
      return [];
    }
  }

  async createGlobalMessage(message: InsertGlobalMessage): Promise<GlobalMessageWithSender> {
    if (!prisma) throw new Error('Database not initialized');
    try {
      const createdMessage = await prisma.globalMessage.create({
        data: message,
        include: { sender: true },
      });

      // Invalidate global messages cache
      if (cacheClient) {
        await cacheClient.del(CacheKeys.globalMessages()).catch(() => {});
      }

      console.log(`[Storage] Persisted global message: ${createdMessage.id}`);
      return createdMessage;
    } catch (error) {
      console.error('Error creating global message:', error);
      throw error;
    }
  }

  async getGlobalMessages(limit: number = 100): Promise<GlobalMessageWithSender[]> {
    if (!prisma) return [];

    // Only use cache for default limit (cache has 100 messages)
    const cache = limit === 100 ? cacheClient : null;
    
    if (cache) {
      try {
        const cached = await cache.get(CacheKeys.globalMessages());
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        console.error('Cache read error:', err);
      }
    }

    try {
      const messages = await prisma.globalMessage.findMany({
        orderBy: { timestamp: 'asc' },
        take: Math.min(limit, 500), // Hard cap at 500
        include: { sender: true },
      });

      // Cache only default limit results
      if (cache && messages.length > 0) {
        await cache
          .set(CacheKeys.globalMessages(), JSON.stringify(messages), {
            EX: CacheTTL.GLOBAL_MESSAGES,
          })
          .catch(() => {});
      }

      return messages;
    } catch (error) {
      console.error('Error getting global messages:', error);
      return [];
    }
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    if (!prisma) throw new Error('Database not initialized');
    try {
      return await prisma.attachment.create({
        data: attachment,
      });
    } catch (error) {
      console.error('Error creating attachment:', error);
      throw error;
    }
  }

  async deleteAttachment(id: number): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.attachment.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  }

  async getOldAttachments(olderThan: Date): Promise<Attachment[]> {
    if (!prisma) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          createdAt: { lt: olderThan },
        },
      });
    } catch (error) {
      console.error('Error getting old attachments:', error);
      return [];
    }
  }

  async getConversationStats(
    userId: number,
    otherUserIds: number[]
  ): Promise<Map<number, { lastMessage: Message | null; unread: number }>> {
    const result = new Map<number, { lastMessage: Message | null; unread: number }>();
    if (!cacheClient || otherUserIds.length === 0) return result;

    try {
      const keys: string[] = [];
      const userMapping: { otherId: number; type: 'last' | 'unread' }[] = [];

      for (const otherId of otherUserIds) {
        const conversationId = this.getConversationId(userId, otherId);
        keys.push(
          CacheKeys.conversationLast(conversationId),
          CacheKeys.conversationUnread(conversationId, userId)
        );
        userMapping.push({ otherId, type: 'last' }, { otherId, type: 'unread' });
      }

      const values = await cacheClient.mGet(keys);

      for (let i = 0; i < values.length; i += 2) {
        const lastVal = values[i];
        const unreadVal = values[i + 1];
        const { otherId } = userMapping[i];

        result.set(otherId, {
          lastMessage: lastVal ? JSON.parse(lastVal) : null,
          unread: unreadVal ? parseInt(unreadVal, 10) : 0,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting conversation stats:', error);
      return result;
    }
  }
}

// Export singleton storage instance
export const storage: IStorage = new DatabaseStorage();
