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
  MessageReactionWithUser,
  MessageReplyPreview,
  UserBlock,
  User,
} from "@shared/schema";
import { unlink } from "fs/promises";
import path from "path";
import { createClient, type RedisClientType } from "redis";
import { prisma } from "./db/prisma";
import {
  conversationMessageInclude,
  getConversationId,
  messageRepository,
  publicUserSelect,
} from "./db/message";
import { sortUsersByPresence } from "./lib/user-utils";


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

const BLOCK_LOOKUP_TTL_MS = 60_000;

let cacheClient: RedisClientType | null = null;
const blockLookupCache = new Map<
  string,
  { expiresAt: number; value: UserBlock | null }
>();

function getBlockLookupCacheKey(user1Id: number, user2Id: number): string {
  const [minUserId, maxUserId] =
    user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  return `${minUserId}:${maxUserId}`;
}

function readBlockLookupCache(
  user1Id: number,
  user2Id: number,
): UserBlock | null | undefined {
  const cacheEntry = blockLookupCache.get(
    getBlockLookupCacheKey(user1Id, user2Id),
  );
  if (!cacheEntry) {
    return undefined;
  }

  if (cacheEntry.expiresAt <= Date.now()) {
    blockLookupCache.delete(getBlockLookupCacheKey(user1Id, user2Id));
    return undefined;
  }

  return cacheEntry.value;
}

function writeBlockLookupCache(
  user1Id: number,
  user2Id: number,
  value: UserBlock | null,
): void {
  blockLookupCache.set(getBlockLookupCacheKey(user1Id, user2Id), {
    expiresAt: Date.now() + BLOCK_LOOKUP_TTL_MS,
    value,
  });
}

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
      throw error;
    }
  },

  async updateProfile(
    id: number,
    profile: { username: string; age: number },
  ): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: {
          username: profile.username,
          age: profile.age,
        },
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      throw error;
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

function getUserPairAdvisoryLockKey(userA: number, userB: number): string {
  const { userId1, userId2 } = normalizeUserPair(userA, userB);
  return ((BigInt(userId1) << 32n) | BigInt(userId2)).toString();
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

  async getFriendshipsForPairs(
    pairs: { userId1: number; userId2: number }[],
  ): Promise<Set<string>> {
    if (!prisma || pairs.length === 0) return new Set();

    const normalPairs = pairs.map((pair) => normalizeUserPair(pair.userId1, pair.userId2));

    // Constructing a manual OR statement since we can't easily query multiple composite tuples directly in Prisma
    const rows = await prisma.friendship.findMany({
      where: {
        OR: normalPairs.map((p) => ({
          userId1: p.userId1,
          userId2: p.userId2,
        })),
      },
      select: {
        userId1: true,
        userId2: true,
      },
    });

    const friendsSet = new Set<string>();
    for (const row of rows) {
      friendsSet.add(`${row.userId1}:${row.userId2}`);
    }

    return friendsSet;
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

  async deleteByUsers(userA: number, userB: number): Promise<boolean> {
    if (!prisma) return false;

    const { userId1, userId2 } = normalizeUserPair(userA, userB);
    const result = await prisma.friendship.deleteMany({
      where: {
        userId1,
        userId2,
      },
    });

    return result.count > 0;
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

    const advisoryLockKey = getUserPairAdvisoryLockKey(senderId, receiverId);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(CAST(${advisoryLockKey} AS bigint))
      `);

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

  async deletePendingBetweenUsers(userA: number, userB: number): Promise<number> {
    if (!prisma) return 0;

    const result = await prisma.friendRequest.deleteMany({
      where: {
        status: "pending",
        OR: [
          {
            senderId: userA,
            receiverId: userB,
          },
          {
            senderId: userB,
            receiverId: userA,
          },
        ],
      },
    });

    return result.count;
  },
};

const blockRepository = {
  async getBetweenUsers(
    userA: number,
    userB: number,
  ): Promise<UserBlock | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<UserBlock[]>(Prisma.sql`
      SELECT
        id,
        blocker_id AS "blockerId",
        blocked_id AS "blockedId",
        created_at AS "createdAt"
      FROM "UserBlocks"
      WHERE
        (blocker_id = ${userA} AND blocked_id = ${userB})
        OR
        (blocker_id = ${userB} AND blocked_id = ${userA})
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    return rows[0];
  },

  async create(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<UserBlock[]>(Prisma.sql`
      INSERT INTO "UserBlocks" (blocker_id, blocked_id)
      VALUES (${blockerId}, ${blockedId})
      ON CONFLICT (blocker_id, blocked_id) DO UPDATE
      SET blocker_id = EXCLUDED.blocker_id
      RETURNING
        id,
        blocker_id AS "blockerId",
        blocked_id AS "blockedId",
        created_at AS "createdAt"
    `);

    return rows[0];
  },

  async delete(
    blockerId: number,
    blockedId: number,
  ): Promise<boolean> {
    if (!prisma) return false;

    const result = await prisma.userBlock.deleteMany({
      where: {
        blockerId,
        blockedId,
      },
    });

    return result.count > 0;
  },

  async getRestrictedUserIds(userId: number): Promise<number[]> {
    if (!prisma) return [];

    const rows = await prisma.$queryRaw<Array<{ restrictedUserId: number }>>(Prisma.sql`
      SELECT
        CASE
          WHEN blocker_id = ${userId} THEN blocked_id
          ELSE blocker_id
        END AS "restrictedUserId"
      FROM "UserBlocks"
      WHERE blocker_id = ${userId} OR blocked_id = ${userId}
    `);

    return rows.map((row) => Number(row.restrictedUserId));
  },

  async getBlockedUsers(blockerId: number): Promise<User[]> {
    if (!prisma) return [];

    try {
      const blocks = await prisma.userBlock.findMany({
        where: { blockerId },
        orderBy: [{ createdAt: "desc" }, { blockedId: "asc" }],
        select: {
          blocked: {
            select: publicUserSelect,
          },
        },
      });

      return blocks.map((block) => block.blocked);
    } catch (error) {
      console.error("Error getting blocked users:", error);
      return [];
    }
  },
};

type ConversationMessageMeta = Pick<
  Message,
  "msgId" | "senderId" | "receiverId" | "deletedAt"
>;

type ConversationReactionSync = {
  messageId: number;
  senderId: number;
  receiverId: number;
  reactions: MessageReactionWithUser[];
};

type ConversationDeleteSync = {
  messageId: number;
  senderId: number;
  receiverId: number;
};

export interface IStorage {
  getUser(id: number): Promise<DbUser | undefined>;
  getUserByUsername(username: string): Promise<DbUser | undefined>;
  getUserByGmail(gmail: string): Promise<DbUser | undefined>;
  createUser(user: InsertUser): Promise<DbUser>;
  deleteUser(id: number): Promise<void>;
  updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  updateUserUsername(id: number, username: string): Promise<DbUser | undefined>;
  updateUserProfile(
    id: number,
    profile: { username: string; age: number },
  ): Promise<DbUser | undefined>;
  getOnlineUsers(): Promise<User[]>;
  getUsersByIds(ids: number[]): Promise<User[]>;
  getFriendUsers(userId: number): Promise<User[]>;
  getConversationUsers(userId: number): Promise<User[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  createMessageWithAttachments(
    message: InsertMessage,
    attachment?: Omit<InsertAttachment, "messageId">,
    replyTo?: MessageReplyPreview | null,
  ): Promise<Message & { attachments: Attachment[] }>;
  getMessagesBetweenUsersCursor(
    user1Id: number,
    user2Id: number,
    opts: { limit: number; cursor?: { timestamp: string; msgId: number } },
  ): Promise<{ messages: Message[]; nextCursor: { timestamp: string; msgId: number } | null }>;
  getRecentMessagesForUser(userId: number): Promise<Message[]>;
  createGlobalMessage(message: InsertGlobalMessage): Promise<GlobalMessageWithSender>;
  getGlobalMessages(limit?: number): Promise<GlobalMessageWithSender[]>;
  cleanupExpiredGlobalMessages(olderThan: Date): Promise<number[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  deleteAttachment(id: number): Promise<void>;
  getOldAttachments(olderThan: Date): Promise<Attachment[]>;
  getConversationStats(
    userId: number,
    otherUserIds: number[],
  ): Promise<Map<number, { lastMessage: Message | null; unread: number }>>;
  getConversationReplyPreview(
    messageId: number,
    userId: number,
  ): Promise<MessageReplyPreview | undefined>;
  getConversationMessageMeta(
    messageId: number,
    userId: number,
  ): Promise<ConversationMessageMeta | undefined>;
  getConversationMessage(messageId: number, userId: number): Promise<Message | undefined>;
  updateConversationMessage(messageId: number, message: string): Promise<Message | undefined>;
  deleteConversationMessage(messageId: number): Promise<Message | undefined>;
  deleteConversationMessageSync(
    messageId: number,
  ): Promise<ConversationDeleteSync | undefined>;
  toggleConversationReaction(
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<Message | undefined>;
  toggleConversationReactionSync(
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<ConversationReactionSync | undefined>;
  getFriendship(user1Id: number, user2Id: number): Promise<Friendship | undefined>;
  areFriends(user1Id: number, user2Id: number): Promise<boolean>;
  addFriend(user1Id: number, user2Id: number): Promise<Friendship | undefined>;
  removeFriend(user1Id: number, user2Id: number): Promise<boolean>;
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
  clearPendingFriendRequestsBetweenUsers(user1Id: number, user2Id: number): Promise<number>;
  getBlockBetweenUsers(user1Id: number, user2Id: number): Promise<UserBlock | undefined>;
  blockUser(blockerId: number, blockedId: number): Promise<UserBlock | undefined>;
  unblockUser(blockerId: number, blockedId: number): Promise<boolean>;
  getBlockedUsers(blockerId: number): Promise<User[]>;
  getRestrictedUserIds(userId: number): Promise<number[]>;
  clearConversation(user1Id: number, user2Id: number): Promise<number>;
  clearConversationAttachments(user1Id: number, user2Id: number): Promise<number>;
  clearEphemeralConversationsForUser(userId: number): Promise<number>;
  cleanupExpiredEphemeralMessages(olderThan: Date): Promise<number>;
  markConversationAsRead(userId: number, otherUserId: number): Promise<void>;
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

  private clearBlockLookupCacheForUser(userId: number): void {
    for (const cacheKey of Array.from(blockLookupCache.keys())) {
      const [leftUserId, rightUserId] = cacheKey.split(":").map(Number);

      if (leftUserId === userId || rightUserId === userId) {
        blockLookupCache.delete(cacheKey);
      }
    }
  }

  private async getConversationMessageRecord(
    messageId: number,
    userId: number,
  ): Promise<Message | undefined> {
    if (!prisma) return undefined;

    const message = await prisma.message.findFirst({
      where: {
        msgId: messageId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: conversationMessageInclude,
    });

    return message ?? undefined;
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
    if (!prisma) {
      return;
    }

    const [conversationPartnerIds, messages] = await Promise.all([
      messageRepository.getConversationPartners(id),
      prisma.message.findMany({
        where: {
          OR: [{ senderId: id }, { receiverId: id }],
        },
        select: {
          msgId: true,
          attachments: true,
        },
      }),
    ]);

    const messageIds = messages.map((message) => message.msgId);
    const attachments = messages.flatMap((message) => message.attachments);

    await prisma.$transaction(async (tx) => {
      if (messageIds.length > 0) {
        await tx.attachment.deleteMany({
          where: {
            messageId: { in: messageIds },
          },
        });
      }

      await tx.messageReaction.deleteMany({
        where:
          messageIds.length > 0
            ? {
                OR: [{ messageId: { in: messageIds } }, { userId: id }],
              }
            : { userId: id },
      });

      if (messageIds.length > 0) {
        await tx.message.deleteMany({
          where: {
            msgId: { in: messageIds },
          },
        });
      }

      await tx.globalMessage.deleteMany({
        where: { senderId: id },
      });

      await tx.friendRequest.deleteMany({
        where: {
          OR: [{ senderId: id }, { receiverId: id }],
        },
      });

      await tx.friendship.deleteMany({
        where: {
          OR: [{ userId1: id }, { userId2: id }],
        },
      });

      await tx.userBlock.deleteMany({
        where: {
          OR: [{ blockerId: id }, { blockedId: id }],
        },
      });

      await tx.user.deleteMany({
        where: { userId: id },
      });
    });

    if (attachments.length > 0) {
      await this.deleteAttachmentFiles(attachments);
    }

    await Promise.allSettled(
      conversationPartnerIds.map((partnerId) =>
        this.invalidateConversationCaches(id, partnerId),
      ),
    );

    if (cacheClient) {
      await cacheClient.del(CacheKeys.globalMessages()).catch(() => {});
    }

    this.clearBlockLookupCacheForUser(id);
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    return userRepository.updateOnlineStatus(id, isOnline);
  }

  async updateUserUsername(id: number, username: string): Promise<DbUser | undefined> {
    return userRepository.updateUsername(id, username);
  }

  async updateUserProfile(
    id: number,
    profile: { username: string; age: number },
  ): Promise<DbUser | undefined> {
    return userRepository.updateProfile(id, profile);
  }

  async getOnlineUsers(): Promise<User[]> {
    return userRepository.getOnlineUsers();
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    return userRepository.getByIds(ids);
  }

  async getFriendUsers(userId: number): Promise<User[]> {
    const [friendUserIds, restrictedUserIds] = await Promise.all([
      friendshipRepository.getFriendUserIds(userId),
      blockRepository.getRestrictedUserIds(userId),
    ]);

    const allowedFriendUserIds = friendUserIds.filter(
      (friendUserId) => !restrictedUserIds.includes(friendUserId),
    );
    if (allowedFriendUserIds.length === 0) {
      return [];
    }

    return userRepository.getByIds(allowedFriendUserIds);
  }

  async getConversationUsers(userId: number): Promise<User[]> {
    const [conversationUserIds, restrictedUserIds] = await Promise.all([
      messageRepository.getConversationPartners(userId),
      blockRepository.getRestrictedUserIds(userId),
    ]);

    const visibleConversationUserIds = conversationUserIds.filter(
      (otherUserId) =>
        otherUserId !== userId && !restrictedUserIds.includes(otherUserId),
    );

    if (visibleConversationUserIds.length === 0) {
      return [];
    }

    const users = await userRepository.getByIds(visibleConversationUserIds);

    return sortUsersByPresence(users);
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
    replyTo?: MessageReplyPreview | null,
  ): Promise<Message & { attachments: Attachment[] }> {
    if (!prisma) throw new Error("Database not initialized");

    const createdMessage = attachment
      ? await prisma.message.create({
          data: {
            ...message,
            attachments: {
              create: attachment,
            },
          },
          include: {
            attachments: true,
          },
        })
      : await prisma.message.create({
          data: message,
        });

    const normalizedMessage: Message & { attachments: Attachment[] } = {
      ...createdMessage,
      attachments: attachment
        ? (createdMessage as typeof createdMessage & { attachments: Attachment[] })
            .attachments
        : [],
      reactions: [],
      replyTo: replyTo ?? null,
      replyToId: createdMessage.replyToId ?? null,
      editedAt: createdMessage.editedAt ?? null,
      deletedAt: createdMessage.deletedAt ?? null,
    };

    this.updateMessageCaches(normalizedMessage).catch((err) =>
      console.error("Cache update error:", err),
    );

    return normalizedMessage;
  }

  async getConversationMessage(
    messageId: number,
    userId: number,
  ): Promise<Message | undefined> {
    return this.getConversationMessageRecord(messageId, userId);
  }

  async getConversationReplyPreview(
    messageId: number,
    userId: number,
  ): Promise<MessageReplyPreview | undefined> {
    if (!prisma) return undefined;

    const replyPreview = await prisma.message.findFirst({
      where: {
        msgId: messageId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        msgId: true,
        senderId: true,
        message: true,
        deletedAt: true,
        sender: {
          select: publicUserSelect,
        },
      },
    });

    return replyPreview ?? undefined;
  }

  async getConversationMessageMeta(
    messageId: number,
    userId: number,
  ): Promise<ConversationMessageMeta | undefined> {
    if (!prisma) return undefined;

    const message = await prisma.message.findFirst({
      where: {
        msgId: messageId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        msgId: true,
        senderId: true,
        receiverId: true,
        deletedAt: true,
      },
    });

    return message ?? undefined;
  }

  async updateConversationMessage(
    messageId: number,
    message: string,
  ): Promise<Message | undefined> {
    if (!prisma) return undefined;

    const updatedMessage = await prisma.message.update({
      where: { msgId: messageId },
      data: {
        message,
        editedAt: new Date(),
      },
      include: conversationMessageInclude,
    });

    await this.invalidateConversationCaches(
      updatedMessage.senderId,
      updatedMessage.receiverId,
    );

    return updatedMessage;
  }

  async deleteConversationMessage(messageId: number): Promise<Message | undefined> {
    if (!prisma) return undefined;

    const existingMessage = await prisma.message.findUnique({
      where: { msgId: messageId },
      include: { attachments: true },
    });

    if (!existingMessage) {
      return undefined;
    }

    await this.softDeleteMessageTransaction(messageId, existingMessage.attachments);

    if (existingMessage.attachments.length > 0) {
      await this.deleteAttachmentFiles(existingMessage.attachments);
    }

    await this.invalidateConversationCaches(
      existingMessage.senderId,
      existingMessage.receiverId,
    );

    const updatedMessage = await prisma.message.findUnique({
      where: { msgId: messageId },
      include: conversationMessageInclude,
    });

    return updatedMessage ?? undefined;
  }

  async deleteConversationMessageSync(
    messageId: number,
  ): Promise<ConversationDeleteSync | undefined> {
    if (!prisma) return undefined;

    const existingMessage = await prisma.message.findUnique({
      where: { msgId: messageId },
      select: {
        msgId: true,
        senderId: true,
        receiverId: true,
        attachments: true,
      },
    });

    if (!existingMessage) {
      return undefined;
    }

    await this.softDeleteMessageTransaction(messageId, existingMessage.attachments);

    if (existingMessage.attachments.length > 0) {
      await this.deleteAttachmentFiles(existingMessage.attachments);
    }

    this.invalidateConversationCaches(
      existingMessage.senderId,
      existingMessage.receiverId,
    ).catch((error) => console.error("Cache invalidate error:", error));

    return {
      messageId: existingMessage.msgId,
      senderId: existingMessage.senderId,
      receiverId: existingMessage.receiverId,
    };
  }

  private async softDeleteMessageTransaction(
    messageId: number,
    attachments: Attachment[],
  ): Promise<void> {
    if (!prisma) return;

    await prisma.$transaction(async (tx) => {
      if (attachments.length > 0) {
        await tx.attachment.deleteMany({
          where: { messageId },
        });
      }

      await tx.messageReaction.deleteMany({
        where: { messageId },
      });

      await tx.message.update({
        where: { msgId: messageId },
        data: {
          message: "Message deleted",
          deletedAt: new Date(),
          editedAt: null,
        },
      });
    });
  }

  private async toggleReactionTransaction(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<void> {
    const existingReaction = await tx.messageReaction.findUnique({
      where: {
        messageId_userId: { messageId, userId },
      },
    });

    if (!existingReaction) {
      await tx.messageReaction.create({
        data: { messageId, userId, emoji },
      });
    } else if (existingReaction.emoji === emoji) {
      await tx.messageReaction.delete({
        where: {
          messageId_userId: { messageId, userId },
        },
      });
    } else {
      await tx.messageReaction.update({
        where: {
          messageId_userId: { messageId, userId },
        },
        data: { emoji },
      });
    }
  }

  async toggleConversationReaction(
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<Message | undefined> {
    if (!prisma) return undefined;

    const updatedMessage = await prisma.$transaction(async (tx) => {
      await this.toggleReactionTransaction(tx, messageId, userId, emoji);

      return tx.message.findUnique({
        where: { msgId: messageId },
        include: conversationMessageInclude,
      });
    });

    if (!updatedMessage) {
      return undefined;
    }

    await this.invalidateConversationCaches(
      updatedMessage.senderId,
      updatedMessage.receiverId,
    );

    return updatedMessage;
  }

  async toggleConversationReactionSync(
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<ConversationReactionSync | undefined> {
    if (!prisma) return undefined;

    const updatedReactionState = await prisma.$transaction(async (tx) => {
      const existingMessage = await tx.message.findUnique({
        where: { msgId: messageId },
        select: {
          msgId: true,
          senderId: true,
          receiverId: true,
        },
      });

      if (!existingMessage) {
        return null;
      }

      await this.toggleReactionTransaction(tx, messageId, userId, emoji);

      const reactions = await tx.messageReaction.findMany({
        where: { messageId },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: publicUserSelect },
        },
      });

      return {
        messageId: existingMessage.msgId,
        senderId: existingMessage.senderId,
        receiverId: existingMessage.receiverId,
        reactions,
      };
    });

    if (!updatedReactionState) {
      return undefined;
    }

    this.invalidateConversationCaches(
      updatedReactionState.senderId,
      updatedReactionState.receiverId,
    ).catch((error) => console.error("Cache invalidate error:", error));

    return updatedReactionState;
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

  async cleanupExpiredGlobalMessages(olderThan: Date): Promise<number[]> {
    const deletedMessageIds =
      await messageRepository.deleteGlobalMessagesOlderThan(olderThan);

    if (deletedMessageIds.length > 0 && cacheClient) {
      await cacheClient.del(CacheKeys.globalMessages()).catch(() => {});
    }

    return deletedMessageIds;
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
        } else {
          result.set(otherId, {
            lastMessage: JSON.parse(lastVal),
            unread: parseInt(unreadVal, 10),
          });
        }
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

  async removeFriend(user1Id: number, user2Id: number): Promise<boolean> {
    return friendshipRepository.deleteByUsers(user1Id, user2Id);
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

  async clearPendingFriendRequestsBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<number> {
    return friendRequestRepository.deletePendingBetweenUsers(user1Id, user2Id);
  }

  async getBlockBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<UserBlock | undefined> {
    const cachedBlock = readBlockLookupCache(user1Id, user2Id);
    if (cachedBlock !== undefined) {
      return cachedBlock ?? undefined;
    }

    const block = await blockRepository.getBetweenUsers(user1Id, user2Id);
    writeBlockLookupCache(user1Id, user2Id, block ?? null);
    return block;
  }

  async blockUser(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined> {
    const block = await blockRepository.create(blockerId, blockedId);
    writeBlockLookupCache(blockerId, blockedId, block ?? null);
    return block;
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<boolean> {
    const removed = await blockRepository.delete(blockerId, blockedId);
    writeBlockLookupCache(blockerId, blockedId, null);
    return removed;
  }

  async getBlockedUsers(blockerId: number): Promise<User[]> {
    return blockRepository.getBlockedUsers(blockerId);
  }

  async getRestrictedUserIds(userId: number): Promise<number[]> {
    return blockRepository.getRestrictedUserIds(userId);
  }

  async clearConversation(user1Id: number, user2Id: number): Promise<number> {
    const attachments = await attachmentRepository.getByConversation(user1Id, user2Id);

    const deletedCount = await messageRepository.deleteConversation(user1Id, user2Id);

    await this.deleteAttachmentFiles(attachments);
    await this.invalidateConversationCaches(user1Id, user2Id);

    return deletedCount;
  }

  async markConversationAsRead(userId: number, otherUserId: number): Promise<void> {
    if (!prisma) return;

    try {
      await prisma.conversationReadState.upsert({
        where: {
          userId_otherUserId: {
            userId: userId,
            otherUserId: otherUserId,
          },
        },
        update: {
          lastReadAt: new Date(),
        },
        create: {
          userId: userId,
          otherUserId: otherUserId,
        },
      });

      // Erase the old Redis cache since it will be stale now
      const conversationId = getConversationId(userId, otherUserId);
      if (cacheClient) {
        const unreadKey = CacheKeys.conversationUnread(conversationId, userId);
        await cacheClient.del(unreadKey);
      }
    } catch (error) {
      console.error("Error marking conversation as read:", error);
    }
  }

  async clearConversationAttachments(
    user1Id: number,
    user2Id: number,
  ): Promise<number> {
    const attachments = await attachmentRepository.getByConversation(user1Id, user2Id);
    if (attachments.length === 0) {
      return 0;
    }

    if (!prisma) {
      return 0;
    }

    const messageIds = Array.from(
      new Set(attachments.map((attachment) => attachment.messageId)),
    );
    const conversationId = getConversationId(user1Id, user2Id);

    await prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({
        where: {
          messageId: { in: messageIds },
        },
      });

      const removableMessages = await tx.message.findMany({
        where: {
          conversationId,
          message: "Sent an attachment",
          attachments: {
            none: {},
          },
        },
        select: {
          msgId: true,
        },
      });

      if (removableMessages.length > 0) {
        await tx.message.deleteMany({
          where: {
            msgId: {
              in: removableMessages.map((message) => message.msgId),
            },
          },
        });
      }
    });

    await this.invalidateConversationCaches(user1Id, user2Id);
    await this.deleteAttachmentFiles(attachments);
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

    if (oldMessages.length === 0) return 0;


    const friendshipCache = new Map<string, boolean>();
    const messageIdsToDelete: number[] = [];

    // Find unique pairs of users
    const uniquePairsMap = new Map<string, { userId1: number; userId2: number }>();
    for (const message of oldMessages) {
      const convId = getConversationId(message.senderId, message.receiverId);
      if (!uniquePairsMap.has(convId)) {
        uniquePairsMap.set(convId, {
          userId1: message.senderId,
          userId2: message.receiverId,
        });
      }
    }

    // Batch fetch true friendships
    const pairsArray = Array.from(uniquePairsMap.values());
    const validPairsSet = await friendshipRepository.getFriendshipsForPairs(pairsArray);

    for (const message of oldMessages) {
      const conversationId = getConversationId(message.senderId, message.receiverId);
      let areFriends = friendshipCache.get(conversationId);

      if (areFriends === undefined) {
        // Extract the normalized keys used by the batch fetch
        const { userId1, userId2 } = normalizeUserPair(
          message.senderId,
          message.receiverId,
        );
        areFriends = validPairsSet.has(`${userId1}:${userId2}`);
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
