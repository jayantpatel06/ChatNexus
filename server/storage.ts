import { Prisma } from "@prisma/client";
import type {
  Attachment,
  DbUser,
  FriendRequest,
  FriendRequestStatus,
  FriendRequestWithUsers,
  Friendship,
  GlobalMessageWithSender,
  InsertAttachment,
  InsertGlobalMessage,
  InsertMessage,
  InsertUser,
  Message,
  MessageReactionWithUser,
  MessageReplyPreview,
  PendingNotificationRecord,
  PushSubscriptionRecord,
  UserBlock,
  User,
  WebPushSubscriptionInput,
} from "@shared/schema";
import { unlink } from "fs/promises";
import path from "path";
import { createClient, type RedisClientType } from "redis";
import { prisma } from "./db/prisma";
import {
  getConversationId,
  messageRepository,
  type ConversationMessageMeta,
  type ConversationReactionSync,
  type ConversationDeleteSync,
} from "./db/message";
import { sortUsersByPresence } from "./lib/user-utils";

import { userRepository } from "./db/repositories/user";
import { attachmentRepository } from "./db/repositories/attachment";
import { friendshipRepository, normalizeUserPair } from "./db/repositories/friendship";
import { friendRequestRepository } from "./db/repositories/friend-request";
import {
  blockRepository,
  blockLookupCache,
  readBlockLookupCache,
  writeBlockLookupCache,
  getDirectionalBlockStateFromPairState,
  type BlockPairState,
  type DirectionalBlockState,
} from "./db/repositories/block";
import { notificationRepository } from "./db/repositories/notification";


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
  cleanupExpiredGlobalMessages(limit: number): Promise<number[]>;
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
  getPendingFriendRequestsForUser(userId: number): Promise<FriendRequestWithUsers[]>;
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
  getBlockStateBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<{
    latestBlock: UserBlock | undefined;
    blockByUser1: UserBlock | undefined;
    blockByUser2: UserBlock | undefined;
  }>;
  getDirectionalBlock(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined>;
  getBlockBetweenUsers(user1Id: number, user2Id: number): Promise<UserBlock | undefined>;
  blockUser(blockerId: number, blockedId: number): Promise<UserBlock | undefined>;
  unblockUser(blockerId: number, blockedId: number): Promise<boolean>;
  getBlockedUsers(blockerId: number): Promise<User[]>;
  getRestrictedUserIds(userId: number): Promise<number[]>;
  getPushSubscriptions(userId: number): Promise<PushSubscriptionRecord[]>;
  savePushSubscription(
    userId: number,
    subscription: WebPushSubscriptionInput,
  ): Promise<PushSubscriptionRecord | undefined>;
  deletePushSubscription(userId: number, endpoint: string): Promise<boolean>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean>;
  clearConversation(user1Id: number, user2Id: number): Promise<number>;
  clearConversationAttachments(user1Id: number, user2Id: number): Promise<number>;
  clearEphemeralConversationsForUser(userId: number): Promise<number>;
  cleanupExpiredEphemeralMessages(olderThan: Date): Promise<number>;
  markConversationAsRead(userId: number, otherUserId: number): Promise<void>;
  createPendingNotification(data: {
    receiverId: number;
    senderId: number;
    messageId: number;
    payload: object;
    expiresAt: Date;
  }): Promise<PendingNotificationRecord>;
  getRetryableNotifications(now: Date, limit?: number): Promise<PendingNotificationRecord[]>;
  getPendingNotificationsForUser(receiverId: number): Promise<PendingNotificationRecord[]>;
  getPendingCountBySender(receiverId: number, senderId: number): Promise<number>;
  markNotificationDelivered(id: number): Promise<void>;
  markNotificationRetry(id: number, nextRetryAt: Date, attempts: number): Promise<void>;
  deleteExpiredNotifications(now: Date): Promise<number>;
  clearPendingNotificationsForUserFromSender(receiverId: number, senderId: number): Promise<number>;
  clearPendingNotificationsForUser(receiverId: number): Promise<number>;
  getUnreadMessageCountsForUser(userId: number): Promise<Map<number, number>>;
}


class DatabaseStorage implements IStorage {
  // ── File System Helpers ─────────────────────────────────────────────

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

  // ── Cache Helpers ───────────────────────────────────────────────────

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

  // ── User Methods ────────────────────────────────────────────────────

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
    const { conversationPartnerIds, attachments } = await userRepository.deleteUser(id);

    if (attachments.length > 0) {
      await this.deleteAttachmentFiles(attachments as Attachment[]);
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

  // ── Message Methods ─────────────────────────────────────────────────

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
    const normalizedMessage = await messageRepository.createMessageWithAttachments(
      message,
      attachment,
      replyTo,
    );

    this.updateMessageCaches(normalizedMessage).catch((err) =>
      console.error("Cache update error:", err),
    );

    return normalizedMessage;
  }

  async getConversationMessage(
    messageId: number,
    userId: number,
  ): Promise<Message | undefined> {
    return messageRepository.getConversationMessageRecord(messageId, userId);
  }

  async getConversationReplyPreview(
    messageId: number,
    userId: number,
  ): Promise<MessageReplyPreview | undefined> {
    return messageRepository.getConversationReplyPreview(messageId, userId);
  }

  async getConversationMessageMeta(
    messageId: number,
    userId: number,
  ): Promise<ConversationMessageMeta | undefined> {
    return messageRepository.getConversationMessageMeta(messageId, userId);
  }

  async updateConversationMessage(
    messageId: number,
    message: string,
  ): Promise<Message | undefined> {
    const updatedMessage = await messageRepository.updateConversationMessage(messageId, message);

    if (updatedMessage) {
      await this.invalidateConversationCaches(
        updatedMessage.senderId,
        updatedMessage.receiverId,
      );
    }

    return updatedMessage;
  }

  async deleteConversationMessage(messageId: number): Promise<Message | undefined> {
    const result = await messageRepository.deleteConversationMessage(messageId);
    if (!result) return undefined;

    if (result.attachments.length > 0) {
      await this.deleteAttachmentFiles(result.attachments);
    }

    await this.invalidateConversationCaches(result.senderId, result.receiverId);
    return result.message;
  }

  async deleteConversationMessageSync(
    messageId: number,
  ): Promise<ConversationDeleteSync | undefined> {
    const result = await messageRepository.deleteConversationMessageSync(messageId);
    if (!result) return undefined;

    if (result.attachments.length > 0) {
      await this.deleteAttachmentFiles(result.attachments);
    }

    this.invalidateConversationCaches(
      result.senderId,
      result.receiverId,
    ).catch((error) => console.error("Cache invalidate error:", error));

    return {
      messageId: result.messageId,
      senderId: result.senderId,
      receiverId: result.receiverId,
    };
  }

  async toggleConversationReaction(
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<Message | undefined> {
    const updatedMessage = await messageRepository.toggleConversationReaction(
      messageId,
      userId,
      emoji,
    );

    if (updatedMessage) {
      await this.invalidateConversationCaches(
        updatedMessage.senderId,
        updatedMessage.receiverId,
      );
    }

    return updatedMessage;
  }

  async toggleConversationReactionSync(
    messageId: number,
    userId: number,
    emoji: string,
  ): Promise<ConversationReactionSync | undefined> {
    const updatedReactionState = await messageRepository.toggleConversationReactionSync(
      messageId,
      userId,
      emoji,
    );

    if (updatedReactionState) {
      this.invalidateConversationCaches(
        updatedReactionState.senderId,
        updatedReactionState.receiverId,
      ).catch((error) => console.error("Cache invalidate error:", error));
    }

    return updatedReactionState;
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

  async cleanupExpiredGlobalMessages(limit: number): Promise<number[]> {
    const deletedMessageIds =
      await messageRepository.deleteGlobalMessagesBeyondLimit(limit);

    if (deletedMessageIds.length > 0 && cacheClient) {
      await cacheClient.del(CacheKeys.globalMessages()).catch(() => {});
    }

    return deletedMessageIds;
  }

  // ── Attachment Methods ──────────────────────────────────────────────

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    return attachmentRepository.create(attachment);
  }

  async deleteAttachment(id: number): Promise<void> {
    return attachmentRepository.deleteById(id);
  }

  async getOldAttachments(olderThan: Date): Promise<Attachment[]> {
    return attachmentRepository.getOlderThan(olderThan);
  }

  // ── Conversation Stats (with cache) ─────────────────────────────────

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

  // ── Friendship Methods ──────────────────────────────────────────────

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

  // ── Friend Request Methods ──────────────────────────────────────────

  async getPendingFriendRequestBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<FriendRequest | undefined> {
    return friendRequestRepository.getPendingBetweenUsers(user1Id, user2Id);
  }

  async getPendingFriendRequestsForUser(
    userId: number,
  ): Promise<FriendRequestWithUsers[]> {
    return friendRequestRepository.getPendingForUser(userId);
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

  // ── Block Methods ───────────────────────────────────────────────────

  async getBlockBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<UserBlock | undefined> {
    const blockState = await this.getBlockStateBetweenUsers(user1Id, user2Id);
    return blockState.latestBlock;
  }

  async getBlockStateBetweenUsers(
    user1Id: number,
    user2Id: number,
  ): Promise<DirectionalBlockState> {
    const cachedPairState = readBlockLookupCache(user1Id, user2Id);
    if (cachedPairState !== undefined) {
      return getDirectionalBlockStateFromPairState(
        cachedPairState,
        user1Id,
        user2Id,
      );
    }

    const pairState = await blockRepository.getPairState(user1Id, user2Id);
    writeBlockLookupCache(user1Id, user2Id, pairState);
    return getDirectionalBlockStateFromPairState(pairState, user1Id, user2Id);
  }

  async getDirectionalBlock(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined> {
    const blockState = await this.getBlockStateBetweenUsers(
      blockerId,
      blockedId,
    );
    return blockState.blockByUser1;
  }

  async blockUser(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined> {
    const block = await blockRepository.create(blockerId, blockedId);
    const pairState = await blockRepository.getPairState(blockerId, blockedId);
    writeBlockLookupCache(blockerId, blockedId, pairState);
    return block;
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<boolean> {
    const removed = await blockRepository.delete(blockerId, blockedId);
    const pairState = await blockRepository.getPairState(
      blockerId,
      blockedId,
    );
    writeBlockLookupCache(blockerId, blockedId, pairState);
    return removed;
  }

  async getBlockedUsers(blockerId: number): Promise<User[]> {
    return blockRepository.getBlockedUsers(blockerId);
  }

  async getRestrictedUserIds(userId: number): Promise<number[]> {
    return blockRepository.getRestrictedUserIds(userId);
  }

  // ── Push Subscription Methods ───────────────────────────────────────

  async getPushSubscriptions(userId: number): Promise<PushSubscriptionRecord[]> {
    return notificationRepository.getPushSubscriptions(userId);
  }

  async savePushSubscription(
    userId: number,
    subscription: WebPushSubscriptionInput,
  ): Promise<PushSubscriptionRecord | undefined> {
    return notificationRepository.savePushSubscription(userId, subscription);
  }

  async deletePushSubscription(
    userId: number,
    endpoint: string,
  ): Promise<boolean> {
    return notificationRepository.deletePushSubscription(userId, endpoint);
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
    return notificationRepository.deletePushSubscriptionByEndpoint(endpoint);
  }

  // ── Conversation Lifecycle Methods ──────────────────────────────────

  async clearConversation(user1Id: number, user2Id: number): Promise<number> {
    const attachments = await attachmentRepository.getByConversation(user1Id, user2Id);

    const deletedCount = await messageRepository.deleteConversation(user1Id, user2Id);

    await this.deleteAttachmentFiles(attachments);
    await this.invalidateConversationCaches(user1Id, user2Id);

    return deletedCount;
  }

  async markConversationAsRead(userId: number, otherUserId: number): Promise<void> {
    await messageRepository.markConversationAsRead(userId, otherUserId);

    // Erase the old Redis cache since it will be stale now
    const conversationId = getConversationId(userId, otherUserId);
    if (cacheClient) {
      const unreadKey = CacheKeys.conversationUnread(conversationId, userId);
      await cacheClient.del(unreadKey);
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

    await messageRepository.clearConversationAttachments(user1Id, user2Id, attachments);

    await this.invalidateConversationCaches(user1Id, user2Id);
    await this.deleteAttachmentFiles(attachments);
    return attachments.length;
  }

  async clearEphemeralConversationsForUser(userId: number): Promise<number> {
    const partners = await messageRepository.getConversationPartners(userId);
    if (partners.length === 0) return 0;

    // Batch-check all friendships in a single query instead of N+1
    const pairs = partners.map((otherUserId) => {
      const { userId1, userId2 } = normalizeUserPair(userId, otherUserId);
      return { userId1, userId2 };
    });
    const friendsSet = await friendshipRepository.getFriendshipsForPairs(pairs);

    let deletedMessages = 0;
    for (const otherUserId of partners) {
      const { userId1, userId2 } = normalizeUserPair(userId, otherUserId);
      if (!friendsSet.has(`${userId1}:${userId2}`)) {
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

  // ── Pending Notification Methods ────────────────────────────────────

  async createPendingNotification(data: {
    receiverId: number;
    senderId: number;
    messageId: number;
    payload: object;
    expiresAt: Date;
  }): Promise<PendingNotificationRecord> {
    return notificationRepository.createPendingNotification(data);
  }

  async getRetryableNotifications(
    now: Date,
    limit = 50,
  ): Promise<PendingNotificationRecord[]> {
    return notificationRepository.getRetryableNotifications(now, limit);
  }

  async getPendingNotificationsForUser(
    receiverId: number,
  ): Promise<PendingNotificationRecord[]> {
    return notificationRepository.getPendingNotificationsForUser(receiverId);
  }

  async getPendingCountBySender(
    receiverId: number,
    senderId: number,
  ): Promise<number> {
    return notificationRepository.getPendingCountBySender(receiverId, senderId);
  }

  async markNotificationDelivered(id: number): Promise<void> {
    return notificationRepository.markNotificationDelivered(id);
  }

  async markNotificationRetry(
    id: number,
    nextRetryAt: Date,
    attempts: number,
  ): Promise<void> {
    return notificationRepository.markNotificationRetry(id, nextRetryAt, attempts);
  }

  async deleteExpiredNotifications(now: Date): Promise<number> {
    return notificationRepository.deleteExpiredNotifications(now);
  }

  async clearPendingNotificationsForUserFromSender(
    receiverId: number,
    senderId: number,
  ): Promise<number> {
    return notificationRepository.clearPendingNotificationsForUserFromSender(receiverId, senderId);
  }

  async clearPendingNotificationsForUser(
    receiverId: number,
  ): Promise<number> {
    return notificationRepository.clearPendingNotificationsForUser(receiverId);
  }

  // ── Unread Counts ───────────────────────────────────────────────────

  async getUnreadMessageCountsForUser(
    userId: number,
  ): Promise<Map<number, number>> {
    return messageRepository.getUnreadMessageCountsForUser(userId);
  }
}

export const storage: IStorage = new DatabaseStorage();
