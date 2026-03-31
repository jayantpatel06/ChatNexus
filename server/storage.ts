import { Prisma } from "@prisma/client";
import type {
  Attachment,
  DbUser,
  FriendRequest,
  FriendRequestStatus,
  Friendship,
  GlobalMessageWithSender,
  InsertAttachment,
  InsertGlobalMessage,
  InsertMessage,
  InsertUser,
  Message,
  User,
} from "@shared/schema";
import { unlink } from "fs/promises";
import path from "path";
import { createClient, type RedisClientType } from "redis";
import { prisma } from "./db/prisma";
import {
  getConversationId,
  messageRepository,
} from "./db/message";

const publicUserSelect = {
  userId: true,
  username: true,
  age: true,
  gender: true,
  isOnline: true,
  isGuest: true,
} as const;

const CacheKeys = {
  conversation: (a: number, b: number) => {
    const [u1, u2] = a < b ? [a, b] : [b, a];
    return `chatnexus:dm:${u1}:${u2}:recent`;
  },
  conversationLast: (conversationId: string) =>
    `chatnexus:conv:${conversationId}:last`,
  conversationUnread: (conversationId: string, userId: number) =>
    `chatnexus:conv:${conversationId}:unread:${userId}`,
  globalMessages: () => "chatnexus:global:recent",
};

const CacheTTL = {
  CONVERSATION: 120,
  LAST_MESSAGE: 60,
  GLOBAL_MESSAGES: 60,
};

let cacheClient: RedisClientType | null = null;

async function initializeCache(): Promise<void> {
  if (!process.env.REDIS_URL) return;

  try {
    cacheClient = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 5000 },
    });

    cacheClient.on("error", (err) => {
      console.error("Redis cache error:", err);
    });

    await cacheClient.connect();
    console.log("Redis cache connected");
  } catch (err) {
    console.error("Failed to initialize Redis cache:", err);
    cacheClient = null;
  }
}

initializeCache();

const userRepository = {
  async getById(id: number): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { userId: id },
      });
      return user ?? undefined;
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  },

  async getByUsername(username: string): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findFirst({
        where: { username },
      });
      return user ?? undefined;
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  },

  async getByGmail(gmail: string): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { gmail },
      });
      return user ?? undefined;
    } catch (error) {
      console.error("Error getting user by email:", error);
      return undefined;
    }
  },

  async create(insertUser: InsertUser): Promise<DbUser> {
    if (!prisma) throw new Error("Database not initialized");
    try {
      return await prisma.user.create({
        data: insertUser,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  },

  async deleteById(id: number): Promise<void> {
    if (!prisma) return;
    try {
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
      console.error("Error deleting user:", error);
    }
  },

  async updateOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.user.update({
        where: { userId: id },
        data: { isOnline },
      });
    } catch (error) {
      console.error("Error updating user online status:", error);
    }
  },

  async updateUsername(id: number, username: string): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: { username },
      });
    } catch (error) {
      console.error("Error updating username:", error);
      return undefined;
    }
  },

  async getOnlineUsers(): Promise<User[]> {
    if (!prisma) return [];
    try {
      return await prisma.user.findMany({
        where: { isOnline: true },
        select: publicUserSelect,
      });
    } catch (error) {
      console.error("Error getting online users:", error);
      return [];
    }
  },

  async getByIds(ids: number[]): Promise<User[]> {
    if (!prisma || ids.length === 0) return [];
    try {
      return await prisma.user.findMany({
        where: {
          userId: { in: ids },
        },
        select: publicUserSelect,
      });
    } catch (error) {
      console.error("Error getting users by IDs:", error);
      return [];
    }
  },
};

const attachmentRepository = {
  async create(attachment: InsertAttachment): Promise<Attachment> {
    if (!prisma) throw new Error("Database not initialized");
    try {
      return await prisma.attachment.create({
        data: attachment,
      });
    } catch (error) {
      console.error("Error creating attachment:", error);
      throw error;
    }
  },

  async deleteById(id: number): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.attachment.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Error deleting attachment:", error);
    }
  },

  async getOlderThan(olderThan: Date): Promise<Attachment[]> {
    if (!prisma) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          createdAt: { lt: olderThan },
        },
      });
    } catch (error) {
      console.error("Error getting old attachments:", error);
      return [];
    }
  },

  async getByConversation(user1Id: number, user2Id: number): Promise<Attachment[]> {
    if (!prisma) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          message: {
            conversationId: getConversationId(user1Id, user2Id),
          },
        },
      });
    } catch (error) {
      console.error("Error getting conversation attachments:", error);
      return [];
    }
  },

  async getByMessageIds(messageIds: number[]): Promise<Attachment[]> {
    if (!prisma || messageIds.length === 0) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          messageId: { in: messageIds },
        },
      });
    } catch (error) {
      console.error("Error getting attachments by message IDs:", error);
      return [];
    }
  },

  async deleteByMessageIds(messageIds: number[]): Promise<void> {
    if (!prisma || messageIds.length === 0) return;
    try {
      await prisma.attachment.deleteMany({
        where: {
          messageId: { in: messageIds },
        },
      });
    } catch (error) {
      console.error("Error deleting attachments by message IDs:", error);
    }
  },
};

function normalizeUserPair(userA: number, userB: number) {
  return userA < userB
    ? { userId1: userA, userId2: userB }
    : { userId1: userB, userId2: userA };
}

function mapFriendRequestRow(row: FriendRequest): FriendRequest {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    respondedAt: row.respondedAt ? new Date(row.respondedAt) : null,
  };
}

function selectFriendRequestByIdSql(id: number) {
  return Prisma.sql`
    SELECT
      id,
      sender_id AS "senderId",
      receiver_id AS "receiverId",
      status,
      created_at AS "createdAt",
      responded_at AS "respondedAt"
    FROM "FriendRequests"
    WHERE id = ${id}
    LIMIT 1
  `;
}

function selectPendingFriendRequestBetweenUsersSql(userA: number, userB: number) {
  return Prisma.sql`
    SELECT
      id,
      sender_id AS "senderId",
      receiver_id AS "receiverId",
      status,
      created_at AS "createdAt",
      responded_at AS "respondedAt"
    FROM "FriendRequests"
    WHERE status = 'pending'
      AND (
        (sender_id = ${userA} AND receiver_id = ${userB})
        OR
        (sender_id = ${userB} AND receiver_id = ${userA})
      )
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
}

const friendshipRepository = {
  async getByUsers(userA: number, userB: number): Promise<Friendship | undefined> {
    if (!prisma) return undefined;

    const { userId1, userId2 } = normalizeUserPair(userA, userB);

    const rows = await prisma.$queryRaw<Friendship[]>(Prisma.sql`
      SELECT
        id,
        user_id1 AS "userId1",
        user_id2 AS "userId2",
        created_at AS "createdAt"
      FROM "Friendships"
      WHERE user_id1 = ${userId1} AND user_id2 = ${userId2}
      LIMIT 1
    `);

    return rows[0];
  },

  async areFriends(userA: number, userB: number): Promise<boolean> {
    if (!prisma) return false;

    const friendship = await friendshipRepository.getByUsers(userA, userB);
    return !!friendship;
  },

  async create(userA: number, userB: number): Promise<Friendship | undefined> {
    if (!prisma) return undefined;

    const { userId1, userId2 } = normalizeUserPair(userA, userB);

    const rows = await prisma.$queryRaw<Friendship[]>(Prisma.sql`
      INSERT INTO "Friendships" (user_id1, user_id2)
      VALUES (${userId1}, ${userId2})
      ON CONFLICT (user_id1, user_id2) DO UPDATE
      SET user_id1 = EXCLUDED.user_id1
      RETURNING
        id,
        user_id1 AS "userId1",
        user_id2 AS "userId2",
        created_at AS "createdAt"
    `);

    return rows[0];
  },

  async getFriendUserIds(userId: number): Promise<number[]> {
    if (!prisma) return [];

    const rows = await prisma.$queryRaw<Array<{ friendUserId: number }>>(Prisma.sql`
      SELECT
        CASE
          WHEN user_id1 = ${userId} THEN user_id2
          ELSE user_id1
        END AS "friendUserId"
      FROM "Friendships"
      WHERE user_id1 = ${userId} OR user_id2 = ${userId}
    `);

    return rows.map((row) => Number(row.friendUserId));
  },
};

const friendRequestRepository = {
  async getPendingBetweenUsers(
    userA: number,
    userB: number,
  ): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<FriendRequest[]>(
      selectPendingFriendRequestBetweenUsersSql(userA, userB),
    );

    return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
  },

  async getById(id: number): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<FriendRequest[]>(selectFriendRequestByIdSql(id));

    return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
  },

  async create(senderId: number, receiverId: number): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const { userId1, userId2 } = normalizeUserPair(senderId, receiverId);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${userId1}, ${userId2})
      `;

      const existingRows = await tx.$queryRaw<FriendRequest[]>(
        selectPendingFriendRequestBetweenUsersSql(senderId, receiverId),
      );
      if (existingRows[0]) {
        return mapFriendRequestRow(existingRows[0]);
      }

      const rows = await tx.$queryRaw<FriendRequest[]>(Prisma.sql`
        INSERT INTO "FriendRequests" (sender_id, receiver_id, status)
        VALUES (${senderId}, ${receiverId}, 'pending')
        RETURNING
          id,
          sender_id AS "senderId",
          receiver_id AS "receiverId",
          status,
          created_at AS "createdAt",
          responded_at AS "respondedAt"
      `);

      return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
    });
  },

  async updateStatus(
    id: number,
    status: Exclude<FriendRequestStatus, "pending">,
  ): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<FriendRequest[]>(Prisma.sql`
      UPDATE "FriendRequests"
      SET
        status = ${status},
        responded_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        status,
        created_at AS "createdAt",
        responded_at AS "respondedAt"
    `);

    return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
  },
};

export interface IStorage {
  getUser(id: number): Promise<DbUser | undefined>;
  getUserByUsername(username: string): Promise<DbUser | undefined>;
  getUserByGmail(gmail: string): Promise<DbUser | undefined>;
  createUser(user: InsertUser): Promise<DbUser>;
  deleteUser(id: number): Promise<void>;
  updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  updateUserUsername(id: number, username: string): Promise<DbUser | undefined>;
  getOnlineUsers(): Promise<User[]>;
  getUsersByIds(ids: number[]): Promise<User[]>;
  getFriendUsers(userId: number): Promise<User[]>;
  getSidebarUsers(userId: number): Promise<User[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  createMessageWithAttachments(
    message: InsertMessage,
    attachment?: Omit<InsertAttachment, "messageId">,
  ): Promise<Message & { attachments: Attachment[] }>;
  getMessagesBetweenUsersCursor(
    user1Id: number,
    user2Id: number,
    opts: { limit: number; cursor?: { timestamp: string; msgId: number } },
  ): Promise<{ messages: Message[]; nextCursor: { timestamp: string; msgId: number } | null }>;
  getRecentMessagesForUser(userId: number): Promise<Message[]>;
  createGlobalMessage(message: InsertGlobalMessage): Promise<GlobalMessageWithSender>;
  getGlobalMessages(limit?: number): Promise<GlobalMessageWithSender[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  deleteAttachment(id: number): Promise<void>;
  getOldAttachments(olderThan: Date): Promise<Attachment[]>;
  getConversationStats(
    userId: number,
    otherUserIds: number[],
  ): Promise<Map<number, { lastMessage: Message | null; unread: number }>>;
  getFriendship(user1Id: number, user2Id: number): Promise<Friendship | undefined>;
  areFriends(user1Id: number, user2Id: number): Promise<boolean>;
  addFriend(user1Id: number, user2Id: number): Promise<Friendship | undefined>;
  getPendingFriendRequestBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<FriendRequest | undefined>;
  getFriendRequestById(id: number): Promise<FriendRequest | undefined>;
  createFriendRequest(
    senderId: number,
    receiverId: number,
  ): Promise<FriendRequest | undefined>;
  updateFriendRequestStatus(
    id: number,
    status: Exclude<FriendRequestStatus, "pending">,
  ): Promise<FriendRequest | undefined>;
  clearConversation(user1Id: number, user2Id: number): Promise<number>;
  clearConversationAttachments(user1Id: number, user2Id: number): Promise<number>;
  clearEphemeralConversationsForUser(userId: number): Promise<number>;
  cleanupExpiredEphemeralMessages(olderThan: Date): Promise<number>;
}

class DatabaseStorage implements IStorage {
  private async deleteAttachmentFiles(attachments: Attachment[]): Promise<void> {
    await Promise.allSettled(
      attachments.map(async (attachment) => {
        const filePath = path.join(
          process.cwd(),
          "uploads",
          path.basename(attachment.url),
        );

        try {
          await unlink(filePath);
        } catch (error: any) {
          if (error?.code !== "ENOENT") {
            console.error("Error deleting attachment file:", error);
          }
        }
      }),
    );
  }

  private async invalidateConversationCaches(
    user1Id: number,
    user2Id: number,
  ): Promise<void> {
    if (!cacheClient) return;

    const conversationId = getConversationId(user1Id, user2Id);
    await Promise.allSettled([
      cacheClient.del(CacheKeys.conversation(user1Id, user2Id)),
      cacheClient.del(CacheKeys.conversationLast(conversationId)),
      cacheClient.del(CacheKeys.conversationUnread(conversationId, user1Id)),
      cacheClient.del(CacheKeys.conversationUnread(conversationId, user2Id)),
    ]);
  }

  async getUser(id: number): Promise<DbUser | undefined> {
    return userRepository.getById(id);
  }

  async getUserByUsername(username: string): Promise<DbUser | undefined> {
    return userRepository.getByUsername(username);
  }

  async getUserByGmail(gmail: string): Promise<DbUser | undefined> {
    return userRepository.getByGmail(gmail);
  }

  async createUser(user: InsertUser): Promise<DbUser> {
    return userRepository.create(user);
  }

  async deleteUser(id: number): Promise<void> {
    return userRepository.deleteById(id);
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    return userRepository.updateOnlineStatus(id, isOnline);
  }

  async updateUserUsername(id: number, username: string): Promise<DbUser | undefined> {
    return userRepository.updateUsername(id, username);
  }

  async getOnlineUsers(): Promise<User[]> {
    return userRepository.getOnlineUsers();
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    return userRepository.getByIds(ids);
  }

  async getFriendUsers(userId: number): Promise<User[]> {
    const friendUserIds = await friendshipRepository.getFriendUserIds(userId);
    if (friendUserIds.length === 0) {
      return [];
    }

    return userRepository.getByIds(friendUserIds);
  }

  async getSidebarUsers(userId: number): Promise<User[]> {
    const [onlineUsers, friendUsers] = await Promise.all([
      userRepository.getOnlineUsers(),
      this.getFriendUsers(userId),
    ]);

    if (friendUsers.length === 0) {
      return onlineUsers
        .filter((onlineUser) => onlineUser.userId !== userId)
        .sort(
          (left, right) =>
            Number(right.isOnline) - Number(left.isOnline) ||
            left.username.localeCompare(right.username),
        );
    }

    const mergedUsers = new Map<number, User>();

    for (const onlineUser of onlineUsers) {
      if (onlineUser.userId !== userId) {
        mergedUsers.set(onlineUser.userId, onlineUser);
      }
    }

    for (const friendUser of friendUsers) {
      if (friendUser.userId !== userId) {
        mergedUsers.set(friendUser.userId, friendUser);
      }
    }

    return Array.from(mergedUsers.values()).sort(
      (left, right) =>
        Number(right.isOnline) - Number(left.isOnline) ||
        left.username.localeCompare(right.username),
    );
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const createdMessage = await messageRepository.create(message);

    this.updateMessageCaches(createdMessage).catch((err) =>
      console.error("Cache update error:", err),
    );

    return createdMessage;
  }

  async createMessageWithAttachments(
    message: InsertMessage,
    attachment?: Omit<InsertAttachment, "messageId">,
  ): Promise<Message & { attachments: Attachment[] }> {
    if (!prisma) throw new Error("Database not initialized");

    const createdMessage = await prisma.$transaction<
      Message & { attachments: Attachment[] }
    >(async (tx) => {
      const savedMessage = await tx.message.create({
        data: message,
      });

      if (!attachment) {
        return {
          ...savedMessage,
          attachments: [],
        };
      }

      const savedAttachment = await tx.attachment.create({
        data: {
          ...attachment,
          messageId: savedMessage.msgId,
        },
      });

      return {
        ...savedMessage,
        attachments: [savedAttachment],
      };
    });

    this.updateMessageCaches(createdMessage).catch((err) =>
      console.error("Cache update error:", err),
    );

    return createdMessage;
  }

  private async updateMessageCaches(message: Message): Promise<void> {
    if (!cacheClient) return;

    const { senderId, receiverId, conversationId } = message;
    if (!senderId || !receiverId) return;

    const convId = conversationId || getConversationId(senderId, receiverId);

    const lastKey = CacheKeys.conversationLast(convId);
    await cacheClient.set(lastKey, JSON.stringify(message), {
      EX: CacheTTL.LAST_MESSAGE,
    });

    const unreadKey = CacheKeys.conversationUnread(convId, receiverId);
    await cacheClient.incr(unreadKey);

    const dmCacheKey = CacheKeys.conversation(senderId, receiverId);
    await cacheClient.del(dmCacheKey);
  }

  async getMessagesBetweenUsersCursor(
    user1Id: number,
    user2Id: number,
    opts: { limit: number; cursor?: { timestamp: string; msgId: number } },
  ): Promise<{ messages: Message[]; nextCursor: { timestamp: string; msgId: number } | null }> {
    if (cacheClient && !opts.cursor) {
      try {
        const cached = await cacheClient.get(
          CacheKeys.conversation(user1Id, user2Id),
        );
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        console.error("Cache read error:", err);
      }
    }

    const result = await messageRepository.getBetweenUsersCursor(
      user1Id,
      user2Id,
      opts,
    );

    if (cacheClient && !opts.cursor && result.messages.length > 0) {
      const cacheKey = CacheKeys.conversation(user1Id, user2Id);
      await cacheClient
        .set(cacheKey, JSON.stringify(result), {
          EX: CacheTTL.CONVERSATION,
        })
        .catch((err) => console.error("Cache write error:", err));
    }

    return result;
  }

  async getRecentMessagesForUser(userId: number): Promise<Message[]> {
    return messageRepository.getRecentForUser(userId);
  }

  async createGlobalMessage(
    message: InsertGlobalMessage,
  ): Promise<GlobalMessageWithSender> {
    const createdMessage = await messageRepository.createGlobalMessage(message);

    if (cacheClient) {
      await cacheClient.del(CacheKeys.globalMessages()).catch(() => {});
    }

    return createdMessage;
  }

  async getGlobalMessages(limit = 100): Promise<GlobalMessageWithSender[]> {
    const cache = limit === 100 ? cacheClient : null;

    if (cache) {
      try {
        const cached = await cache.get(CacheKeys.globalMessages());
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        console.error("Cache read error:", err);
      }
    }

    const messages = await messageRepository.getRecentGlobalMessages(limit);

    if (cache && messages.length > 0) {
      await cache
        .set(CacheKeys.globalMessages(), JSON.stringify(messages), {
          EX: CacheTTL.GLOBAL_MESSAGES,
        })
        .catch(() => {});
    }

    return messages;
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    return attachmentRepository.create(attachment);
  }

  async deleteAttachment(id: number): Promise<void> {
    return attachmentRepository.deleteById(id);
  }

  async getOldAttachments(olderThan: Date): Promise<Attachment[]> {
    return attachmentRepository.getOlderThan(olderThan);
  }

  async getConversationStats(
    userId: number,
    otherUserIds: number[],
  ): Promise<Map<number, { lastMessage: Message | null; unread: number }>> {
    const result = new Map<number, { lastMessage: Message | null; unread: number }>();
    if (otherUserIds.length === 0) return result;

    const uniqueOtherUserIds = Array.from(
      new Set(otherUserIds.filter((otherUserId) => otherUserId !== userId)),
    );

    if (uniqueOtherUserIds.length === 0) {
      return result;
    }

    if (!cacheClient) {
      return messageRepository.getConversationStats(userId, uniqueOtherUserIds);
    }

    try {
      const keys: string[] = [];
      const userMapping: { otherId: number; type: "last" | "unread" }[] = [];
      const fallbackUserIds = new Set<number>();

      for (const otherId of uniqueOtherUserIds) {
        const conversationId = getConversationId(userId, otherId);
        keys.push(
          CacheKeys.conversationLast(conversationId),
          CacheKeys.conversationUnread(conversationId, userId),
        );
        userMapping.push(
          { otherId, type: "last" },
          { otherId, type: "unread" },
        );
      }

      const values = await cacheClient.mGet(keys);

      for (let i = 0; i < values.length; i += 2) {
        const lastVal = values[i];
        const unreadVal = values[i + 1];
        const { otherId } = userMapping[i];

        if (lastVal === null || unreadVal === null) {
          fallbackUserIds.add(otherId);
        }

        result.set(otherId, {
          lastMessage: lastVal ? JSON.parse(lastVal) : null,
          unread: unreadVal ? parseInt(unreadVal, 10) : 0,
        });
      }

      if (fallbackUserIds.size > 0) {
        const fallbackStats = await messageRepository.getConversationStats(
          userId,
          Array.from(fallbackUserIds),
        );

        fallbackStats.forEach((stats, otherUserId) => {
          result.set(otherUserId, stats);
        });
      }

      return result;
    } catch (error) {
      console.error("Error getting conversation stats:", error);
      return messageRepository.getConversationStats(userId, uniqueOtherUserIds);
    }
  }

  async getFriendship(
    user1Id: number,
    user2Id: number,
  ): Promise<Friendship | undefined> {
    return friendshipRepository.getByUsers(user1Id, user2Id);
  }

  async areFriends(user1Id: number, user2Id: number): Promise<boolean> {
    return friendshipRepository.areFriends(user1Id, user2Id);
  }

  async addFriend(
    user1Id: number,
    user2Id: number,
  ): Promise<Friendship | undefined> {
    return friendshipRepository.create(user1Id, user2Id);
  }

  async getPendingFriendRequestBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<FriendRequest | undefined> {
    return friendRequestRepository.getPendingBetweenUsers(user1Id, user2Id);
  }

  async getFriendRequestById(id: number): Promise<FriendRequest | undefined> {
    return friendRequestRepository.getById(id);
  }

  async createFriendRequest(
    senderId: number,
    receiverId: number,
  ): Promise<FriendRequest | undefined> {
    return friendRequestRepository.create(senderId, receiverId);
  }

  async updateFriendRequestStatus(
    id: number,
    status: Exclude<FriendRequestStatus, "pending">,
  ): Promise<FriendRequest | undefined> {
    return friendRequestRepository.updateStatus(id, status);
  }

  async clearConversation(user1Id: number, user2Id: number): Promise<number> {
    const attachments = await attachmentRepository.getByConversation(user1Id, user2Id);
    await this.deleteAttachmentFiles(attachments);

    const deletedCount = await messageRepository.deleteConversation(user1Id, user2Id);
    await this.invalidateConversationCaches(user1Id, user2Id);

    return deletedCount;
  }

  async clearConversationAttachments(
    user1Id: number,
    user2Id: number,
  ): Promise<number> {
    const attachments = await attachmentRepository.getByConversation(user1Id, user2Id);
    if (attachments.length === 0) {
      return 0;
    }

    await this.deleteAttachmentFiles(attachments);
    await attachmentRepository.deleteByMessageIds(
      attachments.map((attachment) => attachment.messageId),
    );

    const removableMessageIds =
      await messageRepository.getAttachmentOnlyMessageIdsForConversation(
        user1Id,
        user2Id,
      );
    if (removableMessageIds.length > 0) {
      await messageRepository.deleteByIds(removableMessageIds);
    }

    await this.invalidateConversationCaches(user1Id, user2Id);
    return attachments.length;
  }

  async clearEphemeralConversationsForUser(userId: number): Promise<number> {
    const partners = await messageRepository.getConversationPartners(userId);
    let deletedMessages = 0;

    for (const otherUserId of partners) {
      const areFriends = await this.areFriends(userId, otherUserId);
      if (!areFriends) {
        deletedMessages += await this.clearConversation(userId, otherUserId);
      }
    }

    return deletedMessages;
  }

  async cleanupExpiredEphemeralMessages(olderThan: Date): Promise<number> {
    const oldMessages = await messageRepository.getOlderThan(olderThan);
    if (oldMessages.length === 0) {
      return 0;
    }

    const friendshipCache = new Map<string, boolean>();
    const messageIdsToDelete: number[] = [];

    for (const message of oldMessages) {
      const conversationId = getConversationId(message.senderId, message.receiverId);
      let areFriends = friendshipCache.get(conversationId);

      if (areFriends === undefined) {
        areFriends = await this.areFriends(message.senderId, message.receiverId);
        friendshipCache.set(conversationId, areFriends);
      }

      if (!areFriends) {
        messageIdsToDelete.push(message.msgId);
      }
    }

    if (messageIdsToDelete.length === 0) {
      return 0;
    }

    const attachments = await attachmentRepository.getByMessageIds(messageIdsToDelete);
    await this.deleteAttachmentFiles(attachments);

    const deletedCount = await messageRepository.deleteByIds(messageIdsToDelete);
    const deletedMessageIdSet = new Set(messageIdsToDelete);

    const invalidatedPairs = new Set<string>();
    for (const message of oldMessages) {
      if (!deletedMessageIdSet.has(message.msgId)) continue;

      const pairKey = getConversationId(message.senderId, message.receiverId);
      if (invalidatedPairs.has(pairKey)) continue;
      invalidatedPairs.add(pairKey);
      await this.invalidateConversationCaches(message.senderId, message.receiverId);
    }

    return deletedCount;
  }
}

export const storage: IStorage = new DatabaseStorage();
