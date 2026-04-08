import { Prisma } from "@prisma/client";
import type {
  GlobalMessageWithSender,
  InsertGlobalMessage,
  InsertMessage,
  Message,
} from "@shared/schema";
import { prisma } from "./prisma";

export const publicUserSelect = {
  userId: true,
  username: true,
  age: true,
  gender: true,
  isOnline: true,
  isGuest: true,
} as const;

const messageReactionInclude = {
  user: {
    select: publicUserSelect,
  },
} as const;

export const conversationMessageInclude = {
  attachments: true,
  reactions: {
    orderBy: {
      createdAt: "asc",
    },
    include: messageReactionInclude,
  },
  replyTo: {
    select: {
      msgId: true,
      senderId: true,
      message: true,
      deletedAt: true,
      sender: {
        select: publicUserSelect,
      },
    },
  },
} as const;

export function getConversationId(user1: number, user2: number): string {
  const [minId, maxId] = user1 < user2 ? [user1, user2] : [user2, user1];
  return `${minId}:${maxId}`;
}

export const messageRepository = {
  async create(message: InsertMessage): Promise<Message> {
    if (!prisma) throw new Error("Database not initialized");
    try {
      return await prisma.message.create({
        data: message,
        include: conversationMessageInclude,
      });
    } catch (error) {
      console.error("Error creating message:", error);
      throw error;
    }
  },

  async createGlobalMessage(
    message: InsertGlobalMessage,
  ): Promise<GlobalMessageWithSender> {
    if (!prisma) throw new Error("Database not initialized");
    try {
      const createdMessage = await prisma.globalMessage.create({
        data: message,
        include: {
          sender: {
            select: publicUserSelect,
          },
        },
      });

      if (process.env.NODE_ENV === "development") {
        console.log(`[Storage] Persisted global message: ${createdMessage.id}`);
      }
      return createdMessage;
    } catch (error) {
      console.error("Error creating global message:", error);
      throw error;
    }
  },

  async getRecentGlobalMessages(limit = 100): Promise<GlobalMessageWithSender[]> {
    if (!prisma) return [];
    try {
      return await prisma.globalMessage.findMany({
        orderBy: { timestamp: "asc" },
        take: Math.min(limit, 500),
        include: {
          sender: {
            select: publicUserSelect,
          },
        },
      });
    } catch (error) {
      console.error("Error getting global messages:", error);
      return [];
    }
  },

  async deleteGlobalMessagesOlderThan(olderThan: Date): Promise<number[]> {
    if (!prisma) return [];
    try {
      return await prisma.$transaction(async (tx) => {
        const expiredMessages = await tx.globalMessage.findMany({
          where: {
            timestamp: { lt: olderThan },
          },
          select: {
            id: true,
          },
        });

        if (expiredMessages.length === 0) {
          return [];
        }

        const expiredMessageIds = expiredMessages.map((message) => message.id);

        await tx.globalMessage.deleteMany({
          where: {
            id: { in: expiredMessageIds },
          },
        });

        return expiredMessageIds;
      });
    } catch (error) {
      console.error("Error deleting expired global messages:", error);
      throw error;
    }
  },

  async getBetweenUsersCursor(
    user1Id: number,
    user2Id: number,
    opts: { limit: number; cursor?: { timestamp: string; msgId: number } },
  ): Promise<{ messages: Message[]; nextCursor: { timestamp: string; msgId: number } | null }> {
    if (!prisma) return { messages: [], nextCursor: null };

    const { limit, cursor } = opts;
    const conversationId = getConversationId(user1Id, user2Id);

    try {
      const raw = await prisma.message.findMany({
        where: { conversationId },
        orderBy: [{ timestamp: "desc" }, { msgId: "desc" }],
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
        include: conversationMessageInclude,
      });

      const hasMore = raw.length > limit;
      const messages = hasMore ? raw.slice(0, limit) : raw;
      const last = messages[messages.length - 1];
      const nextCursor = hasMore
        ? { timestamp: last.timestamp.toISOString(), msgId: last.msgId }
        : null;

      return { messages, nextCursor };
    } catch (error) {
      console.error("Error getting paginated messages:", error);
      return { messages: [], nextCursor: null };
    }
  },

  async getRecentForUser(userId: number): Promise<Message[]> {
    if (!prisma) return [];
    try {
      return await prisma.message.findMany({
        where: {
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        orderBy: { timestamp: "desc" },
        take: 50,
        include: conversationMessageInclude,
      });
    } catch (error) {
      console.error("Error getting recent messages:", error);
      return [];
    }
  },

  async deleteConversation(user1Id: number, user2Id: number): Promise<number> {
    if (!prisma) return 0;
    try {
      const result = await prisma.message.deleteMany({
        where: {
          conversationId: getConversationId(user1Id, user2Id),
        },
      });
      return result.count;
    } catch (error) {
      console.error("Error deleting conversation:", error);
      return 0;
    }
  },

  async getConversationPartners(userId: number): Promise<number[]> {
    if (!prisma) return [];
    try {
      const rows = await prisma.$queryRaw<Array<{ otherUserId: number }>>(Prisma.sql`
        SELECT DISTINCT
          CASE
            WHEN "sender_id" = ${userId} THEN "receiver_id"
            ELSE "sender_id"
          END AS "otherUserId"
        FROM "Messages"
        WHERE "sender_id" = ${userId} OR "receiver_id" = ${userId}
      `);

      return rows.map((row) => Number(row.otherUserId));
    } catch (error) {
      console.error("Error getting conversation partners:", error);
      return [];
    }
  },

  async getOlderThan(
    olderThan: Date,
  ): Promise<Array<Pick<Message, "msgId" | "senderId" | "receiverId" | "timestamp">>> {
    if (!prisma) return [];
    try {
      return await prisma.message.findMany({
        where: {
          timestamp: { lt: olderThan },
        },
        select: {
          msgId: true,
          senderId: true,
          receiverId: true,
          timestamp: true,
        },
      });
    } catch (error) {
      console.error("Error getting old messages:", error);
      return [];
    }
  },

  async deleteByIds(messageIds: number[]): Promise<number> {
    if (!prisma || messageIds.length === 0) return 0;
    try {
      const result = await prisma.message.deleteMany({
        where: {
          msgId: { in: messageIds },
        },
      });
      return result.count;
    } catch (error) {
      console.error("Error deleting messages by IDs:", error);
      return 0;
    }
  },

  async getAttachmentOnlyMessageIdsForConversation(
    user1Id: number,
    user2Id: number,
  ): Promise<number[]> {
    if (!prisma) return [];
    try {
      const messages = await prisma.message.findMany({
        where: {
          conversationId: getConversationId(user1Id, user2Id),
          message: "Sent an attachment",
          attachments: {
            none: {},
          },
        },
        select: {
          msgId: true,
        },
      });

      return messages.map((message) => message.msgId);
    } catch (error) {
      console.error("Error getting attachment-only messages:", error);
      return [];
    }
  },

  async getConversationStats(
    userId: number,
    otherUserIds: number[],
  ): Promise<Map<number, { lastMessage: Message | null; unread: number }>> {
    const result = new Map<number, { lastMessage: Message | null; unread: number }>();

    if (!prisma || otherUserIds.length === 0) {
      return result;
    }

    const uniqueOtherUserIds = Array.from(
      new Set(
        otherUserIds.filter(
          (otherUserId) =>
            Number.isInteger(otherUserId) && otherUserId > 0 && otherUserId !== userId,
        ),
      ),
    );

    if (uniqueOtherUserIds.length === 0) {
      return result;
    }

    const conversationIds = uniqueOtherUserIds.map((otherUserId) =>
      getConversationId(userId, otherUserId),
    );

    try {
      const [lastMessages, unreadCounts] = await Promise.all([
        prisma.$queryRaw<
          Array<
            Pick<
              Message,
              "msgId" | "senderId" | "receiverId" | "conversationId" | "message" | "timestamp"
            >
          >
        >(Prisma.sql`
          SELECT DISTINCT ON ("conversation_id")
            "msg_id" AS "msgId",
            "sender_id" AS "senderId",
            "receiver_id" AS "receiverId",
            "conversation_id" AS "conversationId",
            "message",
            "timestamp"
          FROM "Messages"
          WHERE "conversation_id" IN (${Prisma.join(conversationIds)})
          ORDER BY "conversation_id", "timestamp" DESC, "msg_id" DESC
        `),
        prisma.$queryRaw<
          Array<{
            senderId: number;
            unreadCount: Number;
          }>
        >(Prisma.sql`
          SELECT m."sender_id" AS "senderId", COUNT(*)::int AS "unreadCount"
          FROM "Messages" m
          LEFT JOIN "ConversationReadStates" rs 
            ON rs.user_id = m.receiver_id AND rs.other_user_id = m.sender_id
          WHERE m.receiver_id = ${userId}
            AND m.sender_id IN (${Prisma.join(uniqueOtherUserIds)})
            AND m."timestamp" > COALESCE(rs.last_read_at, '1970-01-01'::timestamp)
          GROUP BY m.sender_id
        `),
      ]);

      const lastMessageByOtherUserId = new Map<number, Message>();
      for (const lastMessage of lastMessages) {
        const otherUserId =
          lastMessage.senderId === userId
            ? lastMessage.receiverId
            : lastMessage.senderId;
        lastMessageByOtherUserId.set(otherUserId, lastMessage as Message);
      }

      const unreadCountByOtherUserId = new Map<number, number>();
      for (const unreadCount of unreadCounts) {
        unreadCountByOtherUserId.set(unreadCount.senderId, Number(unreadCount.unreadCount));
      }

      for (const otherUserId of uniqueOtherUserIds) {
        result.set(otherUserId, {
          lastMessage: lastMessageByOtherUserId.get(otherUserId) ?? null,
          unread: unreadCountByOtherUserId.get(otherUserId) ?? 0,
        });
      }

      return result;
    } catch (error) {
      console.error("Error getting conversation stats:", error);
      return result;
    }
  },
};
