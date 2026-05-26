import { Prisma } from "@prisma/client";
import type {
  PendingNotificationRecord,
  PushSubscriptionRecord,
  WebPushSubscriptionInput,
} from "@shared/schema";
import { prisma } from "../prisma";

export const notificationRepository = {
  // ── Push Subscriptions ──────────────────────────────────────────────

  async getPushSubscriptions(userId: number): Promise<PushSubscriptionRecord[]> {
    if (!prisma) return [];

    try {
      return await prisma.$queryRaw<PushSubscriptionRecord[]>(Prisma.sql`
        SELECT
          id,
          user_id AS "userId",
          endpoint,
          p256dh,
          auth,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM "PushSubscriptions"
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC, id DESC
      `);
    } catch (error) {
      console.error("Error getting push subscriptions:", error);
      return [];
    }
  },

  async savePushSubscription(
    userId: number,
    subscription: WebPushSubscriptionInput,
  ): Promise<PushSubscriptionRecord | undefined> {
    if (!prisma) return undefined;

    try {
      const rows = await prisma.$queryRaw<PushSubscriptionRecord[]>(Prisma.sql`
        INSERT INTO "PushSubscriptions" (
          user_id,
          endpoint,
          p256dh,
          auth,
          created_at,
          updated_at
        )
        VALUES (
          ${userId},
          ${subscription.endpoint},
          ${subscription.keys.p256dh},
          ${subscription.keys.auth},
          NOW(),
          NOW()
        )
        ON CONFLICT (endpoint) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          updated_at = NOW()
        RETURNING
          id,
          user_id AS "userId",
          endpoint,
          p256dh,
          auth,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `);
      return rows[0];
    } catch (error) {
      console.error("Error saving push subscription:", error);
      return undefined;
    }
  },

  async deletePushSubscription(
    userId: number,
    endpoint: string,
  ): Promise<boolean> {
    if (!prisma) return false;

    try {
      const result = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PushSubscriptions"
        WHERE user_id = ${userId} AND endpoint = ${endpoint}
      `);
      return result > 0;
    } catch (error) {
      console.error("Error deleting push subscription:", error);
      return false;
    }
  },

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
    if (!prisma) return false;

    try {
      const result = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PushSubscriptions"
        WHERE endpoint = ${endpoint}
      `);
      return result > 0;
    } catch (error) {
      console.error("Error deleting push subscription by endpoint:", error);
      return false;
    }
  },

  // ── Pending Notifications ───────────────────────────────────────────

  async createPendingNotification(data: {
    receiverId: number;
    senderId: number;
    messageId: number;
    payload: object;
    expiresAt: Date;
  }): Promise<PendingNotificationRecord> {
    const record = await prisma.pendingNotification.create({
      data: {
        receiverId: data.receiverId,
        senderId: data.senderId,
        messageId: data.messageId,
        payload: data.payload as Prisma.InputJsonValue,
        expiresAt: data.expiresAt,
        nextRetryAt: new Date(),
      },
    });
    return record as unknown as PendingNotificationRecord;
  },

  async getRetryableNotifications(
    now: Date,
    limit = 50,
  ): Promise<PendingNotificationRecord[]> {
    const records = await prisma.pendingNotification.findMany({
      where: {
        status: "pending",
        nextRetryAt: { lte: now },
        expiresAt: { gt: now },
      },
      orderBy: { nextRetryAt: "asc" },
      take: limit,
    });
    return records as unknown as PendingNotificationRecord[];
  },

  async getPendingNotificationsForUser(
    receiverId: number,
  ): Promise<PendingNotificationRecord[]> {
    const records = await prisma.pendingNotification.findMany({
      where: { receiverId, status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    return records as unknown as PendingNotificationRecord[];
  },

  async getPendingCountBySender(
    receiverId: number,
    senderId: number,
  ): Promise<number> {
    return prisma.pendingNotification.count({
      where: { receiverId, senderId, status: "pending" },
    });
  },

  async markNotificationDelivered(id: number): Promise<void> {
    await prisma.pendingNotification.update({
      where: { id },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  },

  async markNotificationRetry(
    id: number,
    nextRetryAt: Date,
    attempts: number,
  ): Promise<void> {
    await prisma.pendingNotification.update({
      where: { id },
      data: { nextRetryAt, attempts },
    });
  },

  async deleteExpiredNotifications(now: Date): Promise<number> {
    const delivered = await prisma.pendingNotification.deleteMany({
      where: { status: "delivered" },
    });
    const expired = await prisma.pendingNotification.deleteMany({
      where: { expiresAt: { lte: now }, status: "pending" },
    });
    return delivered.count + expired.count;
  },

  async clearPendingNotificationsForUserFromSender(
    receiverId: number,
    senderId: number,
  ): Promise<number> {
    const result = await prisma.pendingNotification.deleteMany({
      where: { receiverId, senderId, status: "pending" },
    });
    return result.count;
  },

  async clearPendingNotificationsForUser(
    receiverId: number,
  ): Promise<number> {
    const result = await prisma.pendingNotification.deleteMany({
      where: { receiverId, status: "pending" },
    });
    return result.count;
  },
};
