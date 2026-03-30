import type {
  Attachment,
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
import fs from "fs";
import path from "path";
import { createClient, type RedisClientType } from "redis";
import {
  getConversationId,
  messageRepository,
} from "./repositories/message.repository";
import { userRepository } from "./repositories/user.repository";
import { attachmentRepository } from "./repositories/attachment.repository";
import { friendshipRepository } from "./repositories/friendship.repository";
import { friendRequestRepository } from "./repositories/friend-request.repository";

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
    for (const attachment of attachments) {
      try {
        const filePath = path.join(
          process.cwd(),
          "uploads",
          path.basename(attachment.url),
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error("Error deleting attachment file:", error);
      }
    }
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

  async getUser(id: number): Promise<User | undefined> {
    return userRepository.getById(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return userRepository.getByUsername(username);
  }

  async getUserByGmail(gmail: string): Promise<User | undefined> {
    return userRepository.getByGmail(gmail);
  }

  async createUser(user: InsertUser): Promise<User> {
    return userRepository.create(user);
  }

  async deleteUser(id: number): Promise<void> {
    return userRepository.deleteById(id);
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    return userRepository.updateOnlineStatus(id, isOnline);
  }

  async updateUserUsername(id: number, username: string): Promise<User | undefined> {
    return userRepository.updateUsername(id, username);
  }

  async getOnlineUsers(): Promise<User[]> {
    return userRepository.getOnlineUsers();
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const createdMessage = await messageRepository.create(message);

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
